export USER=$(whoami)
export REDIS_HOST=a0a94d54-379f-4e8b-acdc-dba8ed75efc7.redis.cache.windows.net
export REDIS_PASSWORD=YnEOZLJbuX9clXdIvWiKQc9I4D6Tv2JPL6iAt8EwCaY=

# Create prod project
# oc new-project fruits-grocery-prod-${USER} --display-name="${USER} - Fruits Grocery - PROD"

oc adm policy add-role-to-group system:image-puller system:serviceaccounts:fruits-grocery-prod-${USER} -n fruits-grocery-dev-${USER}
oc policy add-role-to-user view -n fruits-grocery-prod-${USER} -z default

oc create deploymentconfig fruits-catalog --image=docker-registry.default.svc:5000/fruits-grocery-dev-${USER}/fruits-catalog:promoteToProd -n fruits-grocery-prod-${USER}

# oc set env dc/fruits-catalog SPRING_DATA_MONGODB_URI=$(oc get secrets $(oc get secrets | grep credentials | awk '{print $1}') -o jsonpath="{.data.connectionString}" |base64 -D |sed -e 's/\?ssl=true/fruitsdb\?ssl=true/')
oc create secret generic fruits-catalog-secret --from-literal=SPRING_DATA_MONGODB_URI=$(oc get secrets $(oc get secrets | grep credentials | awk '{print $1}') -o jsonpath="{.data.connectionString}" |base64 -D |sed -e 's/\?ssl=true/fruitsdb\?ssl=true/')
oc set env dc/fruits-catalog --from=secret/fruits-catalog-secret

oc create deploymentconfig fruits-inventory --image=docker-registry.default.svc:5000/fruits-grocery-dev-${USER}/fruits-inventory:promoteToProd -n fruits-grocery-prod-${USER}
oc set env dc/fruits-inventory FRUITS_CATALOG_HOST=fruits-catalog
# oc set env dc/fruits-inventory REDIS_HOST=a0a94d54-379f-4e8b-acdc-dba8ed75efc7.redis.cache.windows.net
# oc set env dc/fruits-inventory REDIS_PASSWORD=YnEOZLJbuX9clXdIvWiKQc9I4D6Tv2JPL6iAt8EwCaY=
oc create secret generic fruits-inventory-secret \
  --from-literal=REDIS_HOST=${REDIS_HOST} \
  --from-literal=REDIS_PASSWORD=${REDIS_PASSWORD}
oc set env dc/fruits-inventory --from=secret/fruits-inventory-secret

oc rollout cancel dc/fruits-catalog -n fruits-grocery-prod-${USER}
oc rollout cancel dc/fruits-inventory -n fruits-grocery-prod-${USER}

oc set triggers dc/fruits-catalog --manual=true --from-config=false -n fruits-grocery-prod-${USER}
oc set triggers dc/fruits-inventory --manual=true --from-config=false -n fruits-grocery-prod-${USER}

oc set triggers dc/fruits-catalog --manual=true --containers=default-container --from-image=fruits-grocery-dev-${USER}/fruits-catalog:promoteToProd -n fruits-grocery-prod-${USER}
oc set triggers dc/fruits-inventory --manual=true --containers=default-container --from-image=fruits-grocery-dev-${USER}/fruits-inventory:promoteToProd -n fruits-grocery-prod-${USER}

oc get dc fruits-catalog -o yaml -n fruits-grocery-prod-${USER} | sed 's/imagePullPolicy: IfNotPresent/imagePullPolicy: Always/g' | oc replace -n fruits-grocery-prod-${USER} -f -
oc get dc fruits-inventory -o yaml -n fruits-grocery-prod-${USER} | sed 's/imagePullPolicy: IfNotPresent/imagePullPolicy: Always/g' | oc replace -n fruits-grocery-prod-${USER} -f -

oc expose dc fruits-catalog --port=8080 -n fruits-grocery-prod-${USER}
oc expose dc fruits-inventory --port=8080 -n fruits-grocery-prod-${USER}
oc expose svc fruits-catalog --port=8080 -n fruits-grocery-prod-${USER}
oc expose svc fruits-inventory --port=8080 -n fruits-grocery-prod-${USER}

oc annotate service/fruits-catalog prometheus.io/scrape=true prometheus.io/path=/actuator/prometheus prometheus.io/port=8080
oc annotate service/fruits-inventory prometheus.io/scrape=true prometheus.io/port=8080
