const { WorkerPool } = require("./ironfish/build/src/workerPool");
const {
  Transaction: TransactionPosted,
} = require("./ironfish/build/src/primitives/transaction");
const {
  generateKey,
  Note,
  NativeWorkerPool,
  Transaction,
} = require("./ironfish-rust-nodejs");

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

  // Node worker pool create miners fee
  let start = Date.now();
  let x = await nodeWorkerPool.createMinersFee(
    key.spending_key,
    BigInt(20),
    ""
  );
  let end = Date.now();

  let nodeDiff = end - start;
  console.log("NODE:", nodeDiff);

  // Rust worker pool create miners fee
  start = Date.now();
  let y = await rustMinersFee(BigInt(20), "", key.spending_key);
  end = Date.now();

  let rustDiff = end - start;

  console.log("RUST:", rustDiff);
  console.log("");
}

async function main() {
  nodeWorkerPool.start();
  for (let i = 0; i < 10; i++) {
    await generateAndRun();
  }
  await nodeWorkerPool.stop();
}

main();
