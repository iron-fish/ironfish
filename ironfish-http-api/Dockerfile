FROM node:14.16.0 as build
ENV PATH="/root/.cargo/bin:${PATH}"

COPY ./ ./

RUN \
    echo 'deb http://deb.debian.org/debian testing main' >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install jq rsync gcc cmake -y && \
    curl https://sh.rustup.rs -sSf | sh -s -- -y && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh -s -- -y && \
    ./ironfish-http-api/scripts/build.sh

FROM node:14.16.0
EXPOSE 8000:8000

RUN \
    echo 'deb http://deb.debian.org/debian testing main' >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install curl libc6 -y

WORKDIR /usr/src
COPY --from=build /ironfish-http-api/build.api/ironfish-http-api ./app

ENV NODE_ENV production
WORKDIR /usr/src/app
ENTRYPOINT ["yarn"]
CMD ["start"]
