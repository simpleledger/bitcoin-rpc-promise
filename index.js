'use strict';

const RpcClientBase = require('bitcoind-rpc');
const { promisify } = require('util');
const URL = require('url').URL; 
const config = { maxRetries: 5, delayMs: 100, logger: console };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function RpcClient(url, maxRetries, retryDelayMs, logger) {
  if (!(this instanceof RpcClient)) return new RpcClient(url);
  if(maxRetries)
    config.maxRetries = maxRetries;
  if(retryDelayMs)
    config.delayMs = retryDelayMs;
  if(logger)
    config.logger = logger;
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
    for(let i = 0; i < config.maxRetries; i++) {
      try {
        const { result } = await Reflect.apply(fn, this, arguments);
        return result;
      } catch(err) {
        if(i + 1 === config.maxRetries)
          throw err;
        else {
          if(config.logger)
            config.logger.log("[bitcoin-rpc-promise-retry] Retry", i + 1, key, err);
          await sleep(config.delayMs);
        }
      }
    }
    throw Error("[bitcoin-rpc-promise-retry] no rpc call made for", key);
  };
  RpcClient.prototype[key.toLowerCase()] = RpcClient.prototype[key];
}

module.exports = RpcClient;
