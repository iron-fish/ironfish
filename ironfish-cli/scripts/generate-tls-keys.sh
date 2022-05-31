#!/usr/bin/env bash
set -euo pipefail

if [ ! command -v openssl &> /dev/null ]; then
  echo "openssl is not installed but is required"
  exit 1
fi

keyPath=${keyPath:-"node-key.pem"}
certPath=${certPath:-"node-cert.pem"}
certSubject=${certSubject:-"/O=Iron Fish"}
# generates self-signed certificates by default
signKeyPath=${signKeyPath:-$keyPath}

while [ $# -gt 0 ]; do
  case $1 in
    --keyPath) declare keyPath=$2;;
    --certPath) declare certPath=$2;;
    --certSubject) declare certSubject=$2;;
    --signKeyPath) declare signKeyPath=$2;;
    *) break;
  esac;
  shift
done

echo "Generating node server private key at $keyPath"
openssl genrsa -out $keyPath 2048 &> /dev/null
# generate certificate signing request
openssl req -new -key $keyPath -out csr.pem -subj "$certSubject"
echo "Generating node server certificate at $certPath, signing with sign key at $signKeyPath"
openssl x509 -req -in csr.pem -signkey $signKeyPath -out $certPath &> /dev/null
# dispose of request
rm csr.pem
