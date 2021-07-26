FROM node:14.16.0 as build
ENV PATH="/root/.cargo/bin:${PATH}"

COPY ./ ./

RUN \
    echo 'deb http://deb.debian.org/debian testing main' >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install jq rsync gcc cmake -y && \
    curl https://sh.rustup.rs -sSf | sh -s -- -y && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh -s -- -y && \
    ./ironfish-rosetta-api/scripts/build.sh

FROM node:14.16.0
EXPOSE 8080:8080

RUN \
    echo 'deb http://deb.debian.org/debian testing main' >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install curl libc6 -y

WORKDIR /usr/src
COPY --from=build /ironfish-rosetta-api/build.rosetta/ironfish-rosetta-api ./app

ENV NODE_ENV production
WORKDIR /usr/src/app
ENTRYPOINT ["yarn"]
CMD ["start"]
