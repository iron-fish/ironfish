# TRM Ironfish Stratum Changes

## Overall description
- Stratum protocol version bumped to 2.
- Miner gets extranonce from pool (1-5 bytes) that's applied to the randomness header field.
- Pool does no longer send graffiti on subscribe, only the extranonce ("xn") field.
- Miner has control over both the remaining bytes in the randomness field and the full graffiti.
- Miner should preferably make sure the graffiti bytes are printable chars or zeros.
- Miner submits both full randomness and graffiti values.
- Miner always gets submit response messages from the pool.
- Proposed "extensions" added to the protocol.

## Message changes:
- mining.subscribe: client sends "version": 2 to mark the protocol version used.
- mining.subscribe: "agent" field added.
- mining.subscribed: pool sends the "xn" field instead of "graffiti". Extranonce size is deduced from the nr bytes sent, value must be zero-padded.
- mining.submitted: new message, always sent for each submitted share, matches the proposed extension by bzminer.
- stratum error: new generic error message in response to a client message. Does not have a method. Matches proposed extension.

## Testing instructions
- Install rust, yarn, node as specified in README.md.
- Build repo.
- Start daemon with "yarn start start" from ironfish-cli/. Wait until synced.
- Start pool with "yarn start miners:pools:start -v" from ironfish-cli/.
- Start cpu miner with "yarn start miners:start -v -p 127.0.0.1:9034 -n testminer" from ironfish-cli/.
- The cpu miner will print all pool traffic for easy inspection of the protocol.

## Examples session with comments

- Note: all hex strings are treated as byte arrays. Hence, the xn "0005" sent means the first two bytes in the full 180 byte header for this miner will be 0x00 0x05 (or else the share is rejected).

### mining.subscribe + response
Client gets extranonce in the xn field instead of graffiti. Two bytes xnonce used here, 1-5 bytes expected.
```
{"id":1,"method":"mining.subscribe","body":{"version":2,"agent":"teamredminer/0.10.9","publicAddress":"3005e5b38199c0549029dc5cc1991cb285f8de34cd4324caf9239d24c7c7af3b","name":"mytestrig"}}
{"id":23299,"method":"mining.subscribed","body":{"clientId":5,"xn":"0005"}}
```

### mining.set_target
No changes.
```
{"id":23300,"method":"mining.set_target","body":{"target":"00000000494cff9a3f4f473f91d116af7382c45e653facfeef85b8f43d9d6b64"}}
```
### mining.notify
No changes.
```
{"id":23301,"method":"mining.notify","body":{"miningRequestId":21713,"header":"000000000000000005290000000000000002a10858b9cd8a42487122291ef7d1d49fcb7d00dfe0f07104f32a497df9e8716451db067de20d12c97fe836b8040cec8c1c97ddb13b20b541c114343a22fbd0cef5c905b6fb70c80420c78fe0e71fee22b8c436ef39ab411de3c2000000000004c5971b0943007dd8a16c32e5d50eefc4805fc1a2ed3584365990a488ca86870100000000000000000000000000000000000000000000000000000000000000000000"}}
```

### mining.submit
Both full randomness and graffiti submitted. New response message mining.submitted added.

Share accepted.
```
{"id":2,"method":"mining.submit","body":{"miningRequestId":21713,"randomness":"000500000000000e","graffiti":"305a30736e583669626c4145612f6a3577763232482f7372452e514a6933366b"}}
{"id":23302,"method":"mining.submitted","body":{"id":2,"result":true}}
```

Share rejected with error message in the response. Preferred response style.
```
{"id":63,"method":"mining.submit","body":{"miningRequestId":21745,"randomness":"0006000000000020","graffiti":"4172536c6d5550435964794f384e6b68584d413162745268673943756f4d452e"}}
{"id":23432,"method":"mining.submitted","body":{"id":63,"result":false,"message":"Client 6 submitted work for stale mining request: 21745"}}
```

Share rejected with the generic stratum error message. Not recommended, but not considered a violation to conform with earlier extension proposals.
```
{"id":63,"method":"mining.submit","body":{"miningRequestId":21745,"randomness":"0006000000000020","graffiti":"4172536c6d5550435964794f384e6b68584d413162745268673943756f4d452e"}}
{"id":23433,"error":{"id":63,"message":"Duplicate share"}}
```
