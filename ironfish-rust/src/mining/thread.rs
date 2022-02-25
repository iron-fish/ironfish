use std::{
    sync::mpsc::{self, Receiver, SendError, Sender},
    thread,
};

use super::mine;

// TODO: Remove this when we change the header serializer randomness to use a u64 field instead of a double
// Javascript's Number.MAX_SAFE_INTEGER
const MAX_SAFE_INTEGER: usize = 9007199254740991;

// TODO: allow this to be configured
pub(crate) const BATCH_SIZE: usize = 10_000;

#[derive(Debug)]
pub(crate) enum Command {
    // TODO Provide a proper struct instead of a tuple?
    NewWork(Vec<u8>, Vec<u8>, u32),
    Stop,
}

pub(crate) struct Thread {
    command_channel: Sender<Command>,
}
impl Thread {
    pub(crate) fn new(
        id: usize,
        block_found_channel: Sender<(usize, u32)>,
        hash_rate_channel: Sender<u32>,
        pool_size: usize,
    ) -> Self {
        let (work_sender, work_receiver): (Sender<Command>, Receiver<Command>) = mpsc::channel();

        thread::Builder::new()
            .name(id.to_string())
            .spawn(move || {
                process_commands(
                    work_receiver,
                    block_found_channel,
                    hash_rate_channel,
                    id,
                    pool_size,
                )
            })
            .unwrap();

        Thread {
            command_channel: work_sender,
        }
    }

    // TODO: Wrap the errors so we can keep command private
    pub(crate) fn new_work(
        &self,
        header_bytes: Vec<u8>,
        target: Vec<u8>,
        mining_request_id: u32,
    ) -> Result<(), SendError<Command>> {
        self.command_channel
            .send(Command::NewWork(header_bytes, target, mining_request_id))
    }

    pub(crate) fn stop(&self) -> Result<(), SendError<Command>> {
        self.command_channel.send(Command::Stop)
    }
}

fn process_commands(
    work_receiver: Receiver<Command>,
    block_found_channel: Sender<(usize, u32)>,
    hash_rate_channel: Sender<u32>,
    start: usize,
    step_size: usize,
) {
    // TODO: This loop only exists as a temporary hack for 'stop on match' for debugging. Fix and remove this
    loop {
        // Wait for first command
        let mut command: Command = work_receiver.recv().unwrap();
        'outer: loop {
            match command {
                Command::NewWork(mut header_bytes, target, mining_request_id) => {
                    let mut batch_start = start;
                    loop {
                        let batch_size = if batch_start + BATCH_SIZE > MAX_SAFE_INTEGER {
                            MAX_SAFE_INTEGER - batch_start
                        } else {
                            BATCH_SIZE
                        };
                        let match_found = mine::mine_batch(
                            &mut header_bytes,
                            &target,
                            batch_start,
                            step_size,
                            batch_size,
                        );

                        // Submit amount of work done
                        let work_done = match match_found {
                            Some(randomness) => randomness - batch_start,
                            None => batch_size,
                        };
                        hash_rate_channel.send(work_done as u32).unwrap();

                        // New command received, this work is now stale, stop working so we can start on new work
                        if let Ok(cmd) = work_receiver.try_recv() {
                            command = cmd;
                            break;
                        }

                        if let Some(randomness) = match_found {
                            if let Err(e) =
                                block_found_channel.send((randomness, mining_request_id))
                            {
                                panic!("Error sending found block: {:?}", e);
                            }

                            // If "stop on match", break here
                            // break 'outer;
                        }

                        batch_start += BATCH_SIZE;
                        if batch_start >= MAX_SAFE_INTEGER {
                            // miner has exhausted it's search space, stop mining
                            // TODO: add a timestamp rollover
                            println!("Search space exhausted, no longer mining this block.");
                            break 'outer;
                        }
                    }
                }
                Command::Stop => {
                    return;
                }
            }
        }
    }
}
