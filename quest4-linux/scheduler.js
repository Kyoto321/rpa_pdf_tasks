'use strict';

/**
 * Quest 4 – Cron Scheduler
 * Runs the crawler on a schedule using node-cron
 *
 * Usage:
 *   node scheduler.js
 *
 * Default schedule: every hour at :00
 * Override via env:  CRON_SCHEDULE="0 * * * *"
 */

const cron = require('node-cron');
const { createLogger, format, transports } = require('winston');
const path = require('path');
const { execFile } = require('child_process');

const SCHEDULE = process.env.CRON_SCHEDULE || '0 * * * *'; // every hour
const ADDRESS = process.env.CRAWL_ADDRESS || '서울특별시 강남구 테헤란로 152';
const LOG_DIR = path.join(__dirname, 'logs');

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: path.join(LOG_DIR, 'scheduler.log'), maxsize: 2 * 1024 * 1024, maxFiles: 3 }),
    ],
});

logger.info(`Scheduler started. Cron: "${SCHEDULE}"`);
logger.info(`Address: "${ADDRESS}"`);

cron.schedule(SCHEDULE, () => {
    const runAt = new Date().toISOString();
    logger.info(`--- Scheduled run triggered at ${runAt} ---`);

    execFile(
        process.execPath,
        [path.join(__dirname, 'crawler-linux.js'), '--address', ADDRESS, '--output', 'json'],
        { cwd: __dirname },
        (err, stdout, stderr) => {
            if (err) {
                logger.error(`Crawl failed: ${err.message}`);
                if (stderr) logger.error(`stderr: ${stderr.slice(0, 500)}`);
                return;
            }
            logger.info(`Crawl completed:\n${stdout.slice(0, 1000)}`);
        }
    );
});

logger.info('Scheduler running. Press Ctrl+C to stop.');
