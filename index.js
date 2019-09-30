'use strict';

const RpcClientBase = require('bitcoind-rpc');
const { promisify } = require('util');
const URL = require('url').URL; 
const config = { maxRetries: 0, retryDelayMs: 100, logger: console, timeoutMs: 5000 };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function RpcClient(url, options) {
  if (!(this instanceof RpcClient)) return new RpcClient(url);

  if(options) {
    if(options.maxRetries)
      config.maxRetries = options.maxRetries;        // number of retries before throwing an exception (default: 5)
    if(options.retryDelayMs)
      config.retryDelayMs = options.retryDelayMs;    // delay between each retry (default: 100ms)
    if(options.logger)
      config.logger = options.logger;                // setup logger (default: console)
    if(options.timeoutMs)
      config.timeoutMs = options.timeoutMs;          // max timeout for each retry
  }

  const {
    protocol,
    username: user,
    password: pass,
    hostname: host,
    port
  } = new URL(url);

  RpcClientBase.call(this, {
    protocol: protocol.replace(/:$/, ''),
    user,
    pass,
    host,
    port
  });
}

Object.setPrototypeOf(RpcClient.prototype, RpcClientBase.prototype);

for (const key of Object.keys(RpcClientBase.callspec)) {
  const fn = promisify(RpcClientBase.prototype[key]);

  RpcClient.prototype[key] = async function() {
    for(let i = 0; i <= config.maxRetries; i++) {
      try {
        const timeout = new Promise((resolve, reject) => {
          let id = setTimeout(() => {
            clearTimeout(id);
            reject('Timed out in '+ config.timeoutMs + 'ms.');
          }, config.timeoutMs)
        })
        const { result } = await Promise.race([ Reflect.apply(fn, this, arguments), timeout ]);
        return result;
      } catch(err) {
        if(i + 1 === config.maxRetries)
          throw err;
        else {
          if(config.logger)
            config.logger.log("[bitcoin-rpc-promise-retry] Retry", i + 1, key, err);
          await sleep(config.retryDelayMs);
        }
      }
    }
    throw Error("[bitcoin-rpc-promise-retry] no rpc call made for", key);
  };
  RpcClient.prototype[key.toLowerCase()] = RpcClient.prototype[key];
}

module.exports = RpcClient;
