export USER=$(whoami)

oc tag fruits-grocery-dev-${USER}/fruits-catalog:latest fruits-grocery-dev-${USER}/fruits-catalog:promoteToProd
oc tag fruits-grocery-dev-${USER}/fruits-inventory:latest fruits-grocery-dev-${USER}/fruits-inventory:promoteToProd

oc rollout latest dc/fruits-catalog -n fruits-grocery-prod-${USER}
oc rollout latest dc/fruits-inventory -n fruits-grocery-prod-${USER}

oc process -f pipeline.yml -p USERNAME=${USER} | oc create -n fruits-grocery-dev-${USER} -f -
