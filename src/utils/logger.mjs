import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';

// Ensure logs directory exists
const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Get current date for log filename
const getLogFilename = () => {
  const date = dayjs().format('YYYY-MM-DD');
  return path.join(logsDir, `${date}.log`);
};

// Write to log file
const writeToLogFile = (message) => {
  const timestamp = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const logMessage = `[${timestamp}] ${message}\n`;
  
  fs.appendFileSync(getLogFilename(), logMessage);
};

// Custom logger that writes to both console and file
export const logger = {
  log: (message, ...args) => {
    console.log(message, ...args);
    writeToLogFile(typeof message === 'string' ? 
      args.length ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message :
      JSON.stringify(message));
  },
  
  error: (message, ...args) => {
    console.error(message, ...args);
    writeToLogFile(`ERROR: ${typeof message === 'string' ? 
      args.length ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message :
      JSON.stringify(message)}`);
  },
  
  warn: (message, ...args) => {
    console.warn(message, ...args);
    writeToLogFile(`WARNING: ${typeof message === 'string' ? 
      args.length ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message :
      JSON.stringify(message)}`);
  },
  
  info: (message, ...args) => {
    console.info(message, ...args);
    writeToLogFile(`INFO: ${typeof message === 'string' ? 
      args.length ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message :
      JSON.stringify(message)}`);
  },
  
  debug: (message, ...args) => {
    if (process.env.DEBUG) {
      console.debug(message, ...args);
      writeToLogFile(`DEBUG: ${typeof message === 'string' ? 
        args.length ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message :
        JSON.stringify(message)}`);
    }
  }
};

export default logger;
