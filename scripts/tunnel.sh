#!/usr/bin/env bash

DOMAIN=$1
OC_CLUSTER=$2
LOCAL_PORT=${3-9200}

endpoint=$(aws opensearch describe-domains --domain-names $DOMAIN --query 'DomainStatusList[].Endpoints.vpc[]' --output text)

if [ -z "$endpoint" ]; then
  echo "No domain found with name '$DOMAIN'!"
  exit 1
fi

stack_id=$(aws opsworks describe-stacks --query "Stacks[?Name=='$OC_CLUSTER'].StackId[]" --output text)

if [ -z "$stack_id" ]; then
  echo "No opsworks stack found with name '$OC_CLUSTER'!"
  exit 1
fi

instance_ip=$(aws opsworks describe-instances --stack-id $stack_id --query "Instances[?starts_with(Hostname, 'admin') && Status=='online'].PublicIp[]" --output text)

if [ -z "$instance_ip" ]; then
  echo "Unable to find an instance named "admin*". Is the cluster online?"
fi

echo "Tunnel will stay open for 60s without input"
echo "ssh -f -L ${LOCAL_PORT}:${endpoint}:443 $instance_ip sleep 60"
