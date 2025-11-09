// truffle-config.js
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // Ganache
      port: 8545,
      network_id: "*",
      gas: 8000000,
      gasPrice: 2000000000 // 2 gwei
    }
  },
  compilers: {
    solc: {
      version: "0.8.20"
    }
  }
};