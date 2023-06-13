# Iron Fish Tank

An aquarium where you can keep your fishes, pretending they're in the ocean.

This is a [Docker Compose](https://docs.docker.com/compose/) application to
simulate arbitrarily large clusters of Iron Fish nodes. The Iron Fish nodes
are run into an isolated network (without internet access) and form their own
chain (not connected to the mainnet or the testnet).

You can use the Iron Fish Tank to:
- simulate large Iron Fish clusters on one machine;
- create test transactions and mine blocks without affecting the mainnet or testnet;
- simulate partial or full network degradation.

## Quick Start

To start a simulated Iron Fish cluster with 11 nodes:

```
docker-compose up -d --scale fish=10
```

This will start a cluster with 1 *bootstrap* node, and 10 regular nodes. You
can then attach to any of the nodes using `docker exec` to check their
status, for example:

```
docker exec ironfish-tank_fish_1 ironfish status
docker exec ironfish-tank_fish_1 ironfish peers
```

To start mining blocks on a node:

```
docker exec -ti ironfish-tank_fish_1 ironfish miners:start
```

To stop the cluster, use `docker-compose stop`. After stopping the cluster,
any block that was synced by a node will be kept, and these blocks will be
available when the cluster is re-started with `docker-compose up`. Use
`docker-compose rm` to start fresh.

## Simulating network degradation

You can simulate network latency, bandwidth bottlenecks, packet loss, and more using [`tc(8)`](https://man7.org/linux/man-pages/man8/tc.8.html). Here are some examples:

*   Simulate a random network latency between 500ms and 3s (normally distributed):

    ```
    container=ironfish-tank_fish_1
    pid=$(docker inspect "$container" | jq '.[].State.Pid')
    nsenter -t "$pid" -n tc qdisc add dev eth0 root netem delay 500ms 3ms distribution normal
    ```

*   Simulate a 20% packet loss:

    ```
    container=ironfish-tank_fish_1
    pid=$(docker inspect "$container" | jq '.[].State.Pid')
    nsenter -t "$pid" -n tc qdisc add dev eth0 root netem loss 50%
    ```

*   Limit bandwidth to 2 Mbit/s:

    ```
    container=ironfish-tank_fish_1
    pid=$(docker inspect "$container" | jq '.[].State.Pid')
    nsenter -t "$pid" -n tc qdisc add dev eth0 root tbf rate 2mbit latency 50ms burst 2048
    ```

... and many more scenarios that can be simulated with `tc`.
