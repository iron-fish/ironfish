const { WorkerPool } = require("./ironfish/build/src/workerPool");
const {
  Transaction: TransactionPosted,
} = require("./ironfish/build/src/primitives/transaction");
const {
  boxMessage,
  unboxMessage,
} = require("./ironfish/build/src/network/peers/encryption");
const {
  generateKey,
  Note,
  NativeWorkerPool,
  Transaction,
  rustBoxMessage,
  rustUnboxMessage,
} = require("./ironfish-rust-nodejs");
const tweetnacl = require("./node_modules/tweetnacl");

const messagesToBox = [
  `{"type":"candidate","candidate":{"candidate":"a=candidate:1 1 UDP 2122317823 192.168.1.138 61279 typ host","sdpMid":"0","sdpMLineIndex":0}}`,
  `{"type":"offer","sdp":"v=0\r\no=rtc 1224611008 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic:WMS *\r\na=setup:actpass\r\na=ice-ufrag:5SdX\r\na=ice-pwd:kymkT1RNVjEz/RnyT352xi\r\na=ice-options:ice2,trickle\r\na=fingerprint:sha-256 69:A7:B7:4F:FE:9E:38:69:C0:95:C7:F6:1A:CC:11:D3:1C:72:22:06:48:4B:FD:AD:82:7B:A0:A6:12:E8:7C:A8\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=sctp-port:5000\r\na=max-message-size:268435456\r\n"}`,
  `{"type":"offer","sdp":"v=0\r\no=rtc 842174160 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic:WMS *\r\na=setup:actpass\r\na=ice-ufrag:WQW9\r\na=ice-pwd:1pyG3Hq87pNichaVXM4Bt+\r\na=ice-options:ice2,trickle\r\na=fingerprint:sha-256 D5:B2:AE:F6:D2:8C:17:77:A1:1E:5A:11:72:7F:5C:46:44:CF:51:F1:BF:5C:06:F7:1E:23:3D:CF:71:EE:7A:D2\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=sctp-port:5000\r\na=max-message-size:268435456\r\n"}`,
  `{"type":"candidate","candidate":{"candidate":"a=candidate:2 1 UDP 1686109951 68.2.141.111 61194 typ srflx raddr 0.0.0.0 rport 0","sdpMid":"0","sdpMLineIndex":0}}`,
  `{"type":"answer","sdp":"v=0\r\no=rtc 2873356345 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic:WMS *\r\na=setup:active\r\na=ice-ufrag:yM1L\r\na=ice-pwd:hL6zWT4ojEkwMJL3LI9icO\r\na=ice-options:ice2,trickle\r\na=fingerprint:sha-256 45:9A:E3:16:E4:47:A7:E3:A0:41:8F:4B:37:F4:26:CE:81:6B:0B:47:78:60:86:92:25:2B:B8:E8:0A:2B:DB:0B\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=sctp-port:5000\r\na=max-message-size:268435456\r\n"}`,
  `{"type":"answer","sdp":"v=0\r\no=rtc 1132357316 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE 0\r\na=msid-semantic:WMS *\r\na=setup:active\r\na=ice-ufrag:usP6\r\na=ice-pwd:jaCg9fvvR8wz9+KJtsPPlp\r\na=ice-options:ice2,trickle\r\na=fingerprint:sha-256 76:13:D8:CB:4C:28:B7:F7:65:35:ED:A0:88:A7:0E:05:F2:2C:C9:3A:4B:CC:BF:71:8F:35:EE:F0:71:60:F8:F4\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=mid:0\r\na=sendrecv\r\na=sctp-port:5000\r\na=max-message-size:268435456\r\n"}`,
];

// Create each worker pool
const nodeWorkerPool = new WorkerPool({ numWorkers: 2 });
const rustWorkerPool = new NativeWorkerPool();

function rustVerify(tx, verifyFees) {
  return new Promise((resolve) => {
    rustWorkerPool.verifyTransaction(tx, verifyFees, resolve);
  });
}

function rustMinersFee(amount, memo, spendKey) {
  return new Promise((resolve) => {
    rustWorkerPool.createMinersFee(amount, memo, spendKey, resolve);
  });
}

async function generateAndRun() {
  // Boilerplate
  let key = generateKey();
  const note = new Note(key.public_address, -BigInt(20), "");
  let transaction = new Transaction();
  transaction.receive(key.spending_key, note);
  let transaction_posted = new TransactionPosted(transaction.post_miners_fee());

  // // Node worker pool verify
  // let start = Date.now();
  // let x = await nodeWorkerPool.verify(transaction_posted, {
  //   verifyFees: false,
  // });
  // let end = Date.now();

  // let nodeDiff = end - start;
  // console.log("NODE:", nodeDiff, x);

  // // Rust worker pool verify
  // start = Date.now();
  // let ntx = transaction_posted.takeReference();
  // let y = await rustVerify(ntx, false);
  // ntx = null;
  // transaction_posted.returnReference();
  // end = Date.now();
  // console.log("RUST:", rustDiff);
  // console.log("");

  // // Node worker pool create miners fee
  // let start = Date.now();
  // let x = await nodeWorkerPool.createMinersFee(
  //   key.spending_key,
  //   BigInt(20),
  //   ""
  // );
  // let end = Date.now();

  // let nodeDiff = end - start;
  // console.log("NODE:", nodeDiff);

  // // Rust worker pool create miners fee
  // start = Date.now();
  // let y = await rustMinersFee(BigInt(20), "", key.spending_key);
  // end = Date.now();

  // let rustDiff = end - start;
  // console.log("RUST:", rustDiff);
  // console.log("");
}

async function testBoxUnbox() {
  console.log("\nComparing Box/UnboxMessage:::");
  let privateIdentity = tweetnacl.box.keyPair();
  let recipient = Buffer.from(privateIdentity.publicKey);

  for (const msg of messagesToBox) {
    console.log("");

    // NODE WORKPOOL
    let start = process.hrtime.bigint();
    let x = await nodeWorkerPool.boxMessage(
      msg,
      privateIdentity,
      recipient.toString("base64")
    );
    let x1 = await nodeWorkerPool.unboxMessage(
      x.boxedMessage,
      x.nonce,
      recipient.toString("base64"),
      privateIdentity
    );
    let end = process.hrtime.bigint();

    let nodeDiff = end - start;
    console.log(
      "NODE:",
      Number(nodeDiff / 1000n) / 1000,
      "milliseconds - WORKER POOL -",
      x1.message === msg
    );

    // NODE DIRECT FN CALL
    start = process.hrtime.bigint();
    let z = boxMessage(msg, privateIdentity, recipient.toString("base64"));
    let z1 = unboxMessage(
      z.boxedMessage,
      z.nonce,
      recipient.toString("base64"),
      privateIdentity
    );
    end = process.hrtime.bigint();

    let nodeDiffDirect = end - start;
    console.log(
      "NODE:",
      Number(nodeDiffDirect / 1000n) / 1000,
      "milliseconds - DIRECT FN CALL - matches first unboxed msg?",
      z1 === x1.message,
      z1 === msg
    );

    // RUST FN CALL
    start = process.hrtime.bigint();
    let y = rustBoxMessage(msg, privateIdentity.secretKey, recipient);
    let y1 = rustUnboxMessage(
      y.boxedMessage,
      y.nonce,
      recipient,
      privateIdentity.secretKey
    );
    end = process.hrtime.bigint();

    let rustDiff = end - start;
    console.log(
      "RUST:",
      Number(rustDiff / 1000n) / 1000,
      "milliseconds - matches first unboxed msg?",
      y1 === x1.message,
      y1 === msg
    );
  }
}

async function main() {
  nodeWorkerPool.start();
  // for (let i = 0; i < 10; i++) {
  //   await generateAndRun();
  // }

  await testBoxUnbox();
  await nodeWorkerPool.stop();
}

main();
