#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { LLMService } from './src/services/llm.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize LLM service for AI assistance
const llm = new LLMService();

/**
 * Run tests with Jest and capture output
 * @param {string} platform - Platform to test (e.g., 'quora')
 * @param {boolean} watch - Whether to run tests in watch mode
 * @returns {Promise<{success: boolean, output: string, errorOutput: string}>} - Test result
 */
async function runTests(platform, watch = false) {
  const spinner = ora(`Running tests for ${platform}...`).start();
  
  return new Promise((resolve) => {
    const testPath = platform ? `tests/platforms/${platform}.test.mjs` : '';
    const args = ['--', ...(platform ? [testPath] : [])];
    if (watch) args.unshift('--watch');
    
    const jestProcess = spawn('npm', ['test', ...args], { 
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });
    
    let output = '';
    let errorOutput = '';
    
    jestProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      if (!watch) spinner.text = `Running tests: ${chunk.split('\n')[0]}`;
    });
    
    jestProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    jestProcess.on('close', (code) => {
      if (!watch) {
        if (code === 0) {
          spinner.succeed(`Tests for ${platform || 'all platforms'} completed successfully`);
        } else {
          spinner.fail(`Tests for ${platform || 'all platforms'} failed`);
        }
      }
      
      resolve({
        success: code === 0,
        output,
        errorOutput
      });
    });
  });
}

/**
 * Parse test errors from Jest output
 * @param {string} output - Test output
 * @returns {Array<{testName: string, file: string, message: string, stack: string}>} - Parsed errors
 */
function parseTestErrors(output) {
  const errors = [];
  const lines = output.split('\n');
  
  let currentError = null;
  let collectingStack = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Test failure headline
    if (line.includes('✕')) {
      currentError = {
        testName: line.trim().replace('✕ ', ''),
        file: '',
        message: '',
        stack: ''
      };
      collectingStack = false;
      continue;
    }
    
    // Error location in file
    if (currentError && line.includes('at ') && line.includes('.mjs')) {
      const match = line.match(/\s+at\s+.*\s+\((.+\.mjs:\d+:\d+)\)/);
      if (match && !currentError.file) {
        currentError.file = match[1];
      }
    }
    
    // Error message
    if (currentError && line.includes('Error:') && !collectingStack) {
      currentError.message = line.trim();
      collectingStack = true;
      continue;
    }
    
    // Collecting stack trace
    if (collectingStack && line.trim() && currentError) {
      currentError.stack += line + '\n';
    }
    
    // End of error
    if (collectingStack && (!line.trim() || line.includes('at '))) {
      if (currentError && currentError.testName && currentError.message) {
        errors.push({ ...currentError });
        currentError = null;
        collectingStack = false;
      }
    }
  }
  
  return errors.filter(error => error.testName && error.message);
}

/**
 * Use AI to analyze test failure and suggest fix
 * @param {object} error - Test error
 * @param {string} sourceCode - Source code with error
 * @returns {Promise<{analysis: string, suggestedFix: string}>} - AI analysis and fix
 */
async function analyzeTestFailure(error, sourceCode) {
  const spinner = ora('AI agent analyzing test failure...').start();
  
  const prompt = `
You are a debugging expert. You need to fix a JavaScript test failure.

Test name: ${error.testName}
Error message: ${error.message}
Error location: ${error.file}
Stack trace: 
${error.stack}

Here's the source code:
\`\`\`javascript
${sourceCode}
\`\`\`

Please analyze the issue and provide:
1. A detailed analysis of what's causing the test to fail
2. A specific code fix that would resolve the issue (show exact code to replace)
`;

  try {
    const response = await llm.callLLM(prompt);
    
    // Extract the analysis and suggested fix from the response
    const analysisMatch = response.match(/Analysis:([\s\S]*?)(?=Suggested Fix:|$)/i);
    const fixMatch = response.match(/Suggested Fix:([\s\S]*?)(?=$)/i);
    
    const analysis = analysisMatch ? analysisMatch[1].trim() : response;
    const suggestedFix = fixMatch ? fixMatch[1].trim() : '';
    
    spinner.succeed('AI analysis complete');
    
    return { analysis, suggestedFix };
  } catch (error) {
    spinner.fail(`AI analysis failed: ${error.message}`);
    return { 
      analysis: 'AI analysis failed', 
      suggestedFix: ''
    };
  }
}

/**
 * Fix source code based on AI suggestion
 * @param {string} filePath - Path to file with error
 * @param {string} suggestedFix - AI-suggested fix
 * @returns {Promise<boolean>} - Success status
 */
async function applyFix(filePath, suggestedFix) {
  const spinner = ora(`Applying fix to ${filePath}...`).start();
  
  try {
    const fullPath = resolve(__dirname, filePath.split(':')[0]);
    
    if (!existsSync(fullPath)) {
      spinner.fail(`File not found: ${fullPath}`);
      return false;
    }
    
    const sourceCode = readFileSync(fullPath, 'utf8');
    
    // Try to extract code blocks from markdown format
    const codeBlockRegex = /```(?:javascript|js)?\s*\n([\s\S]*?)\n```/;
    const match = suggestedFix.match(codeBlockRegex);
    
    let fixedCode;
    if (match && match[1]) {
      // If we have a code block, use it as the fix
      fixedCode = sourceCode.replace(/\/\/ AUTO-FIXED BY TEST-AGENT:.*\n/g, '');
      fixedCode = `// AUTO-FIXED BY TEST-AGENT: ${new Date().toISOString()}\n${match[1]}`;
    } else {
      // Otherwise try to apply the fix as raw text
      spinner.warn('No code block found in AI suggestion, using raw text.');
      fixedCode = suggestedFix;
    }
    
    // Write the fixed code back to file
    writeFileSync(fullPath, fixedCode, 'utf8');
    
    spinner.succeed(`Fix applied to ${filePath}`);
    return true;
  } catch (error) {
    spinner.fail(`Failed to apply fix: ${error.message}`);
    return false;
  }
}

/**
 * Main function that runs tests, analyzes failures, and fixes issues
 */
async function main() {
  // Parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .option('platform', {
      alias: 'p',
      describe: 'Platform to test',
      type: 'string'
    })
    .option('watch', {
      alias: 'w',
      describe: 'Watch mode',
      type: 'boolean',
      default: false
    })
    .option('fix', {
      alias: 'f',
      describe: 'Automatically fix issues',
      type: 'boolean',
      default: false
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Verbose output',
      type: 'boolean',
      default: false
    })
    .help()
    .argv;

  console.log(chalk.blue('🤖 AI-powered Test Agent'));
  console.log(chalk.gray('Running tests with auto-fix capabilities\n'));

  try {
    // Check if platform exists
    if (argv.platform) {
      const testPath = join(__dirname, 'tests', 'platforms', `${argv.platform}.test.mjs`);
      if (!existsSync(testPath)) {
        console.error(chalk.red(`❌ Test file for platform "${argv.platform}" not found: ${testPath}`));
        process.exit(1);
      }
    }

    // Run tests
    const { success, output, errorOutput } = await runTests(argv.platform, argv.watch);
    
    if (argv.verbose) {
      console.log(chalk.gray('\nTest output:'));
      console.log(output);
      
      if (errorOutput) {
        console.log(chalk.gray('\nError output:'));
        console.log(errorOutput);
      }
    }
    
    // If tests failed and fix flag is set, analyze and fix
    if (!success && argv.fix) {
      console.log(chalk.yellow('\n🔍 Analyzing test failures...'));
      
      const errors = parseTestErrors(output);
      console.log(chalk.gray(`Found ${errors.length} test failures`));
      
      for (const error of errors) {
        console.log(chalk.yellow(`\nTest: ${error.testName}`));
        console.log(chalk.gray(`File: ${error.file}`));
        console.log(chalk.red(`Error: ${error.message}`));
        
        try {
          // Get source code
          const filePath = error.file.split(':')[0];
          const fullPath = resolve(__dirname, filePath);
          const sourceCode = readFileSync(fullPath, 'utf8');
          
          // Analyze with AI
          const { analysis, suggestedFix } = await analyzeTestFailure(error, sourceCode);
          
          console.log(chalk.cyan('\nAI Analysis:'));
          console.log(analysis);
          
          if (suggestedFix) {
            console.log(chalk.green('\nSuggested Fix:'));
            console.log(suggestedFix);
            
            // Apply fix if available
            const fixed = await applyFix(filePath, suggestedFix);
            
            if (fixed) {
              console.log(chalk.green('\n✅ Fix applied successfully'));
              
              // Run test again to verify fix
              console.log(chalk.blue('\nVerifying fix by running test again...'));
              const verifyResult = await runTests(argv.platform);
              
              if (verifyResult.success) {
                console.log(chalk.green('🎉 All tests pass after applying fix!'));
              } else {
                console.log(chalk.yellow('⚠️ Some tests still failing after applying fix. May need further investigation.'));
              }
            }
          } else {
            console.log(chalk.yellow('\n⚠️ No specific fix suggested by AI.'));
          }
        } catch (e) {
          console.error(chalk.red(`Error processing fix: ${e.message}`));
        }
      }
    }
    
    // Print summary
    console.log(chalk.blue('\n📊 Test Summary:'));
    console.log(success 
      ? chalk.green('✅ All tests passed successfully!')
      : chalk.red('❌ Some tests failed. Run with --fix flag to attempt auto-fixing.'));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error running test agent: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(chalk.red(`Unhandled error: ${error.message}`));
  process.exit(1);
});
