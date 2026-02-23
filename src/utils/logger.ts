import winston from 'winston';

// Service identifier for Dr.Oc monitoring
const SERVICE_ID = 'USMM';

// Standardized format for all services
const consoleFormat = winston.format.printf(({ timestamp, level, message, label, ...metadata }) => {
    const serviceLabel = (label as string) || SERVICE_ID;
    let msg = `[${timestamp}] [${serviceLabel}] [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

const fileFormat = winston.format.printf(({ timestamp, level, message, label, ...metadata }) => {
    const serviceLabel = (label as string) || SERVICE_ID;
    let msg = `[${timestamp}] [${serviceLabel}] [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});

export const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    defaultMeta: { label: SERVICE_ID },
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                consoleFormat
            )
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                fileFormat
            )
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                fileFormat
            )
        }),
    ],
});

export default logger;
