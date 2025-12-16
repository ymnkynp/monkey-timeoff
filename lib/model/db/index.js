"use strict";

const fs = require("fs");
const path = require("path");
const { Sequelize } = require("sequelize");

const env = process.env.NODE_ENV || "development";
const config = require(__dirname + '/../../../config/db.json')[env];
const sequelize = new Sequelize(config.database, config.username, config.password, config);
const db = {};

const basename = path.basename(__filename);

fs
  .readdirSync(__dirname)
  .filter(file => (file.indexOf(".") !== 0) && (file !== basename))
  .forEach(file => {
    const modelDefiner = require(path.join(__dirname, file));
    const model = modelDefiner(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Re-attach legacy instance/class methods if present in model options
Object.keys(db).forEach(modelName => {
  const model = db[modelName];
  if (model.options && model.options.instanceMethods) {
    Object.assign(model.prototype, model.options.instanceMethods);
  }
  if (model.options && model.options.classMethods) {
    Object.assign(model, model.options.classMethods);
  }
});

// Link models according associations
Object.keys(db).forEach(modelName => {
  if ("associate" in db[modelName]) {
    db[modelName].associate(db);
  } else if (db[modelName].options && db[modelName].options.classMethods && db[modelName].options.classMethods.associate) {
    db[modelName].options.classMethods.associate.call(db[modelName], db);
  }
});

// Add scopes
Object.keys(db).forEach(modelName => {
  if ('loadScope' in db[modelName]) {
    db[modelName].loadScope(db);
  } else if (db[modelName].options && db[modelName].options.classMethods && db[modelName].options.classMethods.loadScope) {
    db[modelName].options.classMethods.loadScope.call(db[modelName], db);
  }
});

// Link models based on associations that are based on scopes
Object.keys(db).forEach(modelName => {
  if ('scopeAssociate' in db[modelName]) {
    db[modelName].scopeAssociate(db);
  } else if (db[modelName].options && db[modelName].options.classMethods && db[modelName].options.classMethods.scopeAssociate) {
    db[modelName].options.classMethods.scopeAssociate.call(db[modelName], db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
