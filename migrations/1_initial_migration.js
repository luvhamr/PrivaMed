const Migrations = artifacts.require("Migrations");
const AccessControlRegistry = artifacts.require("AccessControlRegistry");

module.exports = async function (deployer) {
  await deployer.deploy(Migrations);
  await deployer.deploy(AccessControlRegistry);
};
