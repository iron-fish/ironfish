#!/usr/bin/env bash
set -euo pipefail

print_usage() {
  cat << EOF

  generate-tls-keys.sh

  generates a private key and a x509 public certificate for enabling TLS

    options:
      --keyPath      the output path for the private key. default value 'node-key.pem'
      --certPath     the output path for the public certificate. default value 'node-cert.pem'
      --certSubject  the subject for the x509 public certificate. default value '/O=Iron Fish'
      --signKeyPath  the input path of the certificate signing key. uses the generated private key to self-sign by default

EOF
}

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
    *) print_usage; exit 0;;
  esac;
  shift
done

echo "Generating node server private key at $keyPath"
openssl genrsa -out $keyPath 2048 &> /dev/null
# generate certificate signing request
openssl req -new -days 365 -key $keyPath -out csr.pem -subj "$certSubject"
echo "Generating node server certificate at $certPath, signing with sign key at $signKeyPath"
openssl x509 -req -in csr.pem -signkey $signKeyPath -out $certPath &> /dev/null
# dispose of request file
rm csr.pem
