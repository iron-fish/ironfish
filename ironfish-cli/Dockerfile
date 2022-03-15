FROM node:16.13.0-bullseye as build
ENV PATH="/root/.cargo/bin:${PATH}"

COPY ./ ./

RUN \
    apt-get update && \
    apt-get install jq rsync gcc cmake python -y && \
    curl https://sh.rustup.rs -sSf | sh -s -- -y && \
    ./ironfish-cli/scripts/build.sh

FROM node:16.13.0-bullseye-slim
EXPOSE 8020:8020
EXPOSE 9033:9033
VOLUME /root/.ironfish
ENV NODE_ENV production
ENV PATH="/usr/src/app/bin:${PATH}"

RUN \
    apt-get update && \
    apt-get install curl libc6 -y

WORKDIR /usr/src
COPY --from=build /ironfish-cli/build.cli/ironfish-cli ./app
COPY --from=build /ironfish-cli/scripts/entrypoint.sh ./app/
RUN chmod +x ./app/entrypoint.sh

WORKDIR /usr/src/app
ENTRYPOINT ["./entrypoint.sh"]
CMD ["start", "--rpc.ipc", "--rpc.tcp"]
