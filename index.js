'use strict';

const RpcClientBase = require('bitcoind-rpc');
const { promisify } = require('util');
const URL = require('url').URL; 
const defaults = { maxRetries: 0, retryDelayMs: 100, logger: console, timeoutMs: 5000 };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class RpcClientRetry extends RpcClientBase {
    constructor(url, opts={}) {

      const {
        protocol,
        username: user,
        password: pass,
        hostname: host,
        port
      } = new URL(url);
      super({
        protocol: protocol.replace(/:$/, ''),
        user,
        pass,
        host,
        port});

      this.maxRetries = opts.maxRetries || defaults.maxRetries;       // number of retries before throwing an exception (default: 5)
      this.retryDelayMs= opts.retryDelayMs || defaults.retryDelayMs;  // delay between each retry (default: 100ms)
      this.logger = opts.logger || defaults.logger;                   // setup logger (default: console)
      this.timeoutMs = opts.timeoutMs || defaults.timeoutMs;          // max timeout for each retry

      //Object.setPrototypeOf(RpcClientRetry.prototype, RpcClientBase.prototype);

      for (const key of Object.keys(RpcClientBase.callspec)) {
        const fn = promisify(RpcClientBase.prototype[key]);
      
        this[key] = async function() {
          for(let i = 0; i <= this.maxRetries; i++) {
            try {
              const timeout = new Promise((resolve, reject) => {
                let id = setTimeout(() => {
                  clearTimeout(id);
                  reject('Timed out in '+ this.timeoutMs + 'ms.');
                }, this.timeoutMs)
              })
              const { result } = await Promise.race([ Reflect.apply(fn, this, arguments), timeout ]);
              return result;
            } catch(err) {
              if(i + 1 === this.maxRetries)
                throw err;
              else {
                if(this.logger)
                  this.logger.log("[bitcoin-rpc-promise-retry] Retry", i + 1, key, err);
                await sleep(this.retryDelayMs);
              }
            }
          }
          throw Error("[bitcoin-rpc-promise-retry] no rpc call made for", key);
        };
        this[key.toLowerCase()] = this[key];
      }
  }
}

module.exports = RpcClientRetry;
