FROM node:20-bookworm AS build
ENV PATH="/root/.cargo/bin:${PATH}"

RUN \
    --mount=type=cache,target=/var/cache/apt \
    apt-get update && \
    apt-get install jq rsync -y

RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain=1.76.0

COPY ./ /usr/src/ironfish

RUN /usr/src/ironfish/ironfish-cli/scripts/build.sh

FROM node:20-bookworm-slim

EXPOSE 8020:8020
EXPOSE 9033:9033
VOLUME /root/.ironfish
ENV NODE_ENV production

COPY --from=build /usr/src/ironfish/ironfish-cli/build.cli/ironfish-cli /usr/share/ironfish
COPY --from=build --chmod=755 /usr/src/ironfish/ironfish-cli/scripts/docker-entrypoint.sh /usr/bin/ironfish

ENTRYPOINT ["/usr/bin/ironfish"]
CMD ["start", "--rpc.ipc", "--rpc.tcp"]
