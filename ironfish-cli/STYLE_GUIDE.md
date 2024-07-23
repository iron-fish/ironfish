# CLI UX Guide

The Iron Fish CLI is for humans before machines. The primary goal of anyone developing CLI plugins should always be usability. Input and output should be consistent across commands to allow the user to easily learn how to interact with new commands.

Based on https://devcenter.heroku.com/articles/cli-style-guide

## Naming the command
The CLI is made up of topics and commands. For the command `ironfish migrations:start`, migrations is the topic and start is the command.

Generally topics are plural nouns and commands are verbs.

Topic and command names should always be a single, lowercase word without spaces, hyphens, underscores, or other word delimiters. Colons, however, are allowed as this is how to define subcommands (such as `ironfish wallet:transactions:add`). If there is no obvious way to avoid having multiple words, separate with kebab-case: `ironfish service:estimate-fee-rates`

Because topics are generally nouns, the root command of a topic usually lists those nouns. So in the case of `ironfish migrations`, it will list all the migrations. Never create a *:list command such as `ironfish migrations:list`.

## Command Description
Topic and command descriptions should be provided for all topics and commands. They should fit on 80 character width screens, begin with a lowercase character, and should not end in a period.

## Input
Input to commands is typically provided by flags and args. Stdin can also be used in cases where it is useful to stream files or information in (such as with heroku run).

### Flags

Flags are preferred to args when there are many inputs, particularly inputs of the same type. They involve a bit more typing, but make the use of the CLI clearer. For example, `ironfish wallet:send` used to accept an argument for the account to use, as well as --to flag to specify the account to send to.

So using `ironfish wallet:send` used to work like this:

```bash
$ ironfish wallet:send source_account --to dest_account
```

This is confusing to the user since it isn’t clear which account they are sending from and which one they are sending to. By switching to required flags, we instead expect input in this form:

```bash
ironfish wallet:send --from source_account --to dest_account
```

This also allows the user to specify the flags in any order, and gives them the confidence that they are running the command correctly. It also allows us to show better error messages.

Ensure that descriptions are provided for all flags, that the descriptions are in lowercase, that they are concise (so as to fit on narrow screens), and that they do not end in a period to match other flag descriptions.


### Arguments
Arguments are the basic way to provide input for a command. While flags are generally preferred, they are sometimes unnecessary in cases where there is only 1 argument, or the arguments are obvious and in an obvious order.

In the case of `ironfish chain:power`, we can specify the block sequence we want to determine the network mining power  with an argument. We can also specify how many blocks back to look to average the mining power with a flag.

```bash
ironfish chain:power 5432 --history 20
```

If this was done with only arguments, it wouldn’t be clear if the sequence should go before or after the number of blocks to use to sample the network mining power. Using a required flag instead allows the user to specify it either way.

### Prompting
Prompting for missing input provides a nice way to show complicated options in the CLI. For example, `ironfish wallet:use` shows the following if no account is specified as an arg.

```
$ ironfish wallet:use

? Which wallet would you like to use? (Use arrow keys)
❯ vitalik
  satoshi
  jason
```

> ℹ️ Use [inquirer](https://github.com/sboudrias/Inquirer.js) to show prompts like this.

However, if prompting is required to complete a command, this means the user will not be able to script the command. Ensure that args or flags can always be provided to bypass the prompt. In this case, `ironfish wallet:use` can take in an argument for the account to set as default to skip the prompt.

## Output

When designing the output for a command, commands should output human readable output and not machine readable output. This means you should use components under the `ui` module such as `card`, `table`, or normal logs. It's fine if you only display a simplified version of the output. If the user needs the full data in machine readable format they can use the `--json` flag.

You can categorize commands in a few ways, and you will design their output differently depending on the purpose of the command. You have output commands (status, chain:blocks:info, wallet:transactions), operation commands (stop, wallet:rename).

### JSON Output

We want to support JSON output in all data commands. This will allow developers to use our CLI for basic automating purposes avoiding the need to set up an HTTP client.

If a command returns data it should have `static enableJsonFlag = true` and return an object with the JSON data in the command. The output JSON will automatically be colorized. See more here, https://oclif.io/docs/json/

It's OK to both return an object and use `log` even if JSON is not enabled. If you need custom logic and don't want to rely on returning the JSON, you can use `jsonEnabled()` and the `ui.json()` component to manually log colorized JSON.

This is not necessary for operation commands that perform actions and quit such as `wallet:rename`.

### Progress

Many commands need to run long running operations. The CLI should not look like it's unresponsive. For example, `ironfish wallet:post` posts a transaction and optionally sends it to the network:

```
ironfish wallet:post 403662343137346
Posting the transaction... done
```

Use cli.action() from cli-ux to show this output. Using this component ensures that warnings and errors from the RPC are properly displayed, the spinner is displayed correctly when it is a tty, alternative output is used when not a tty, and that the spinner will work on the right platform.

Actions are displayed on stderr because they are out-of-band information on a running task.
