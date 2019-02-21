# ocp-on-azure-workshop
Cloud Native application on OpenShift on Azure

##

### Install Jaeger, Prometheus & Grafana

```
oc new-project cockpit --display-name="Cockpit"
oc adm pod-network make-projects-global cockpit
oc process -f https://raw.githubusercontent.com/jaegertracing/jaeger-openshift/master/all-in-one/jaeger-all-in-one-template.yml | oc create -f - -n cockpit
oc process -f https://raw.githubusercontent.com/nmasse-itix/OpenShift-Docker-Images/master/grafana/prometheus.yaml -p NAMESPACE=cockpit | oc create -n cockpit -f -
oc process -f https://raw.githubusercontent.com/nmasse-itix/OpenShift-Docker-Images/master/grafana/grafana.yaml -p NAMESPACE=cockpit | oc create -n cockpit -f -



oc process -f https://raw.githubusercontent.com/nmasse-itix/OpenShift-Docker-Images/master/grafana/prometheus.yaml -p NAMESPACE=cockpit -p PROMETHEUS_VOLUME_SIZE=100Gi | oc create -n cockpit -f -
```
