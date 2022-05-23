/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
use std::{
    collections::VecDeque,
    sync::mpsc::{self, Receiver, SendError, Sender},
    thread,
};

use super::mine;

#[derive(Debug)]
pub(crate) enum Command {
    NewWork(
        Vec<u8>, // header bytes
        Vec<u8>, // target
        u32,     // mining request id
    ),
    Stop,
    Pause,
}

pub(crate) struct Thread {
    command_channel: Sender<Command>,
}
impl Thread {
    pub(crate) fn new(
        id: u64,
        block_found_channel: Sender<(u64, u32)>,
        hash_rate_channel: Sender<u32>,
        pool_size: usize,
        batch_size: u32,
    ) -> Self {
        let (work_sender, work_receiver) = mpsc::channel::<Command>();

        thread::Builder::new()
            .name(id.to_string())
            .spawn(move || {
                process_commands(
                    work_receiver,
                    block_found_channel,
                    hash_rate_channel,
                    id,
                    pool_size,
                    batch_size as u64,
                )
            })
            .unwrap();

        Thread {
            command_channel: work_sender,
        }
    }

    pub(crate) fn new_work(
        &self,
        header_bytes: Vec<u8>,
        target: Vec<u8>,
        mining_request_id: u32,
    ) -> Result<(), SendError<Command>> {
        self.command_channel
            .send(Command::NewWork(header_bytes, target, mining_request_id))
    }

    pub(crate) fn pause(&self) -> Result<(), SendError<Command>> {
        self.command_channel.send(Command::Pause)
    }

    pub(crate) fn stop(&self) -> Result<(), SendError<Command>> {
        self.command_channel.send(Command::Stop)
    }
}

fn process_commands(
    work_receiver: Receiver<Command>,
    block_found_channel: Sender<(u64, u32)>,
    hash_rate_channel: Sender<u32>,
    start: u64,
    step_size: usize,
    default_batch_size: u64,
) {
    let mut commands: VecDeque<Command> = VecDeque::new();
    loop {
        // If there is no pending work, wait for work with a blocking call
        if commands.is_empty() {
            let new_command: Command = work_receiver.recv().unwrap();
            commands.push_back(new_command);
        }

        let command = commands.pop_front().unwrap();
        match command {
            Command::NewWork(mut header_bytes, target, mining_request_id) => {
                let mut batch_start = start;
                loop {
                    let remaining_search_space = u64::MAX - batch_start;
                    let batch_size = if remaining_search_space > default_batch_size {
                        default_batch_size
                    } else {
                        remaining_search_space
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
                    hash_rate_channel
                        .send((work_done / step_size as u64) as u32)
                        .unwrap();

                    // New command received, this work is now stale, stop working so we can start on new work
                    if let Ok(cmd) = work_receiver.try_recv() {
                        commands.push_back(cmd);
                        break;
                    }

                    if let Some(randomness) = match_found {
                        if let Err(e) = block_found_channel.send((randomness, mining_request_id)) {
                            panic!("Error sending found block: {:?}", e);
                        }
                    }

                    if remaining_search_space < default_batch_size {
                        // miner has exhausted it's search space, stop mining
                        println!("Search space exhausted, no longer mining this block.");
                        break;
                    }
                    batch_start += default_batch_size;
                }
            }
            Command::Pause => {
                continue;
            }
            Command::Stop => {
                return;
            }
        }
    }
}
