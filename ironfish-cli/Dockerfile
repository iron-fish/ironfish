FROM node:14.16.0 as build
ENV PATH="/root/.cargo/bin:${PATH}"

COPY ./ ./

RUN \
    apt-get update && \
    apt-get install jq rsync -y && \
    curl https://sh.rustup.rs -sSf | sh -s -- -y && \
    cargo install wasm-pack && \
    ./ironfish-cli/scripts/build.sh

FROM node:14.16.0-slim
EXPOSE 8020:8020
EXPOSE 9033:9033
VOLUME /root/.ironfish
ENV NODE_ENV production

WORKDIR /usr/src
COPY --from=build /ironfish-cli/build.cli/ironfish-cli ./app

# TODO: use environment variables for this
WORKDIR /usr/src/app
ENTRYPOINT ["./bin/run"]
CMD ["start", "--rpc.ipc", "--rpc.tcp"]
