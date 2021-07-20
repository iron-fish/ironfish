FROM node:14.16.0 as build
ENV PATH="/root/.cargo/bin:${PATH}"

COPY ./ ./

RUN \
    echo 'deb http://deb.debian.org/debian testing main' >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install jq rsync gcc cmake -y && \
    curl https://sh.rustup.rs -sSf | sh -s -- -y && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh -s -- -y && \
    ./ironfish-cli/scripts/build.sh

FROM node:14.16.0-slim
EXPOSE 8020:8020
EXPOSE 9033:9033
VOLUME /root/.ironfish
ENV NODE_ENV production
ENV PATH="/usr/src/app/bin:${PATH}"

RUN \
    echo 'deb http://deb.debian.org/debian testing main' >> /etc/apt/sources.list && \
    apt-get update && \
    apt-get install curl libc6 -y

WORKDIR /usr/src
COPY --from=build /ironfish-cli/build.cli/ironfish-cli ./app
COPY --from=build /ironfish-cli/scripts/entrypoint.sh ./app/
RUN chmod +x ./app/entrypoint.sh
# TODO: use environment variables for this
WORKDIR /usr/src/app
ENTRYPOINT ["./entrypoint.sh"]
CMD ["start", "--rpc.ipc", "--rpc.tcp"]
