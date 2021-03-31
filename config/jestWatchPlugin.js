/**
 * Adds a 'b' command to the jest watcher to rebuild TypeScript project references.
 */

const ts = require('typescript')

// Given a diagnostic, returns info that can be logged to the console.
function getTextForDiagnostic(diagnostic) {
  if (diagnostic.file) {
    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
      diagnostic.start
    )
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      "\n"
    )
    // TODO: Colorize this like standard tsc output. ts provides a formatter,
    // but on last attempt to use it, the jest watcher ate the output.
    return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
  } else {
    return `${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`
  }
}

// Reports errors
function reportDiagnostic(diagnostic) {
  console.error(getTextForDiagnostic(diagnostic))
}
// Reports status, like 'Project needs to be built because output file does not exist'
// Not currently relevant to the plugin, but passed in so we don't lose the info
function reportSolutionBuilderStatus(diagnostic) {
  console.info(getTextForDiagnostic(diagnostic))
}
// Reports summary with number of errors
function reportErrorSummary(errorCount) {
  console.info(errorCount === 0
    ? `References built successfully.`
    : `Build complete with ${errorCount} error${errorCount === 1 ? '' : 's'}.`
  )
}

const host = ts.createSolutionBuilderHost(
  ts.sys,
  ts.createEmitAndSemanticDiagnosticsBuilderProgram,
  reportDiagnostic,
  reportSolutionBuilderStatus,
  reportErrorSummary
)

class TypescriptWatchPlugin {
  getUsageInfo(globalConfig) {
    return {
      key: 'b',
      prompt: 'build TypeScript project references',
    }
  }

  run(globalConfig, updateConfigAndRun) {
    console.info('Building TypeScript project references...')

    return new Promise((resolve, reject) => {
      const configPath = ts.findConfigFile(globalConfig.rootDir, ts.sys.fileExists)
      if (!configPath) {
        reject(`Could not find a valid 'tsconfig.json'.`)
      }
  
      const solution = ts.createSolutionBuilder(host, [configPath], {})
  
      const exitStatus = solution.buildReferences(configPath)

      if (exitStatus === 0) {
        // Since we're just building references that aren't
        // tracked by the test watcher, trigger a full test run.
        if (globalConfig.watchAll === false) {
          updateConfigAndRun({ mode: 'watchAll' })
          updateConfigAndRun({ mode: 'watch' })
        } else {
          resolve(true)
          return
        }
      }

      // We triggered a run if necessary, so always return false here.
      resolve(false)
    })

  }
}

module.exports = TypescriptWatchPlugin
