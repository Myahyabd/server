const roundMoney = value => Math.round(Number(value || 0) * 100) / 100;

module.exports = {
  roundMoney,
};
