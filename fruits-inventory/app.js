'use strict';

// Set default server port to 8080
var port = process.env.PORT || 8080;
var http = require('http');

// Connect to Redis cache server. Default to localhost.
const redis = require('redis');
var redisClient = redis.createClient(
  {
    'host': process.env.REDIS_HOST || 'localhost',
    'port': process.env.REDIS_PORT || 6379
  }
);

const path = require('path');
const fs = require('fs');
const {promisify} = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const readFile = promisify(fs.readFile);

// Setup logging
const logger = require('winston');

// Health Check Middleware
const probe = require('kube-probe');

// Initialize Express application.
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));

let configMap;
let message;

// Prometheus middleware configuration.
const promBundle = require("express-prom-bundle");
const metricsMiddleware = promBundle({includeMethod: true, includePath: true});
app.use(metricsMiddleware);

// OpenTracing + Jaeger middleware configuration.
const { Tags, FORMAT_HTTP_HEADERS } = require('opentracing')
var opentracingMiddleware = require('express-opentracing').default;
var initTracer = require('jaeger-client').initTracer;

var config = {
  'serviceName': 'fruits-inventory',
  'reporter': {
    'logSpans': process.env.LOG_SPANS || true,
    'agentHost': process.env.JAEGER_HOST,
    'agentPort': 6832
  },
  'sampler': { 'type': 'const', 'param': 1 }
};
var options = {
  'tags': { 'fruits-inventory': '1.0.0' },
  'logger': logger
};
var jaegerTracer = initTracer(config, options);

// Add OpenTracing Middleware on all invocations except /api/health
app.use("/api/((?!health))*", opentracingMiddleware({tracer: jaegerTracer}))

// Fruits inventory API definition.
app.use('/api/fruits', (request, response) => {
  const parentSpanContext = request.span.context();

  // Create a new client span for catalog invocation.
  const headers = {};
  const span = createClientSpan(parentSpanContext, 'fruits-catalog', 'http://localhost:8080/api/fruits');
  jaegerTracer.inject(span, FORMAT_HTTP_HEADERS, headers);

  // Define fruits-catalog invocation.
  var req = http.request({
    //hostname: "localhost", port: 8080,
    hostname: "localhost", port: 8080,
    path: '/api/fruits', method: 'GET', headers: headers
  }, function(resp) {
    // When invocation is OK.
    resp.on('data', function(data) {
      span.setTag(Tags.HTTP_STATUS_CODE, 200); span.finish();

      // Extract redis keys from fruit names.
      var fruits = JSON.parse(data);
      var keys = fruits.map(fruit => fruit.name);

      // Create a new client span before invoking Redis.
      const redisSpan = createClientSpan(parentSpanContext, 'redis', 'http://redis:6379');
      jaegerTracer.inject(redisSpan, FORMAT_HTTP_HEADERS, headers);
      redisClient.hmget("fruits:inventory", keys, function (err, replies) {

        if (err) {
          redisSpan.setTag(Tags.HTTP_STATUS_CODE, 500); redisSpan.finish();
          response.status(500);
          return response.send({error: "Error while fetching redis cache"});
        }
        redisSpan.setTag(Tags.HTTP_STATUS_CODE, 200); redisSpan.finish();

        // Just add quantity from Redis values before sending back response.
        replies.forEach(function (reply, i) {
          fruits[i].quantity = reply;
        });
        return response.send(fruits);
      });
    });
    resp.on('error', function(e) {
      span.setTag(Tags.HTTP_STATUS_CODE, 500); span.finish();
      response.status(500);
      return response.send({error: "Error while invoking fruits-catalog"});
    });
  });
  req.end();
});

// Set health check
probe(app);

// Initialize Redis cache content.
redisClient.hmset("fruits:inventory", ["Orange", 1230,
    "Banana", 2507, "Apple", 356, "Cherry", 4289],
    function (err, res) {
      console.log("Redis initialization result: " + res);
    }
);

// Periodic check for config map update
// If new configMap is found, then set new log level
setInterval(() => {
  retrieveConfigfMap().then(config => {
    if (!config) {
      message = null;
      return;
    }

    configMap = config;
    message = config.message;

    // Set New log level
    if (logger.level !== config.level.toLowerCase()) {
      logger.info('New configuration retrieved: {}', config.message);
      logger.info('New log level: {}', config.level.toLowerCase());
      logger.level = config.level.toLowerCase();
    }
  }).catch(err => {
    logger.error('Error getting config', err);
  });
}, 2000);

// Get ConfigMap Stuff
const jsyaml = require('js-yaml');

// Find the Config Map
function retrieveConfigfMap () {
  return readFile(process.env.NODE_CONFIGMAP_PATH || 'app-config.yml', {encoding: 'utf8'}).then(configMap => {
    // Parse the configMap, which is yaml
    const configMapParsed = jsyaml.safeLoad(configMap);
    return configMapParsed;
  });
}

function createClientSpan(rootSpanCtx, service, url) {
  const span = jaegerTracer.startSpan(service + ' invocation', {childOf: rootSpanCtx});
  span.log( {'event': service + ' invocation' });
  span.setTag(Tags.HTTP_URL, url);
  span.setTag(Tags.HTTP_METHOD, "GET");
  span.setTag(Tags.SPAN_KIND, Tags.SPAN_KIND_RPC_CLIENT);
  return span
}

app.listen(port, function () {
  console.log('Fruits-inventory listening on port: ' + port);
})

module.exports = app;
