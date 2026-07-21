#!/usr/bin/env node

const crypto = require('crypto');
const _verify = crypto.verify;
crypto.verify = function (...args) {
  const hexArgs = args.map((a, i) => (i === 1 || i === 3) ? a.toString('hex') : a);
  console.log('crypto.verify called with params:', ...hexArgs);
  return _verify.apply(this, args);
};

const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    console.log('Client :: ready');
    conn.exec('sleep 100', (err, stream) => {
        if (err) throw err;
        stream.on('close', (code, signal) => {
            console.log('Stream :: close :: code: ' + code + ', signal: ' + signal);
            conn.end();
        }).on('data', (data) => {
            console.log('STDOUT: ' + data);
        }).stderr.on('data', (data) => {
            console.log('STDERR: ' + data);
        });
    });
}).connect({
    host: 'localhost',
    port: '22',
    username: 'user',
    password: '1111',
    debug: (msg) => {
        console.log(msg)
    },
    algorithms: {
      cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com'],
      kex: ['ecdh-sha2-nistp256'],
      serverHostKey: ['rsa-sha2-256'],
    },
});

