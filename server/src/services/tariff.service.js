const toNumber = (value) => Number(value || 0);

const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getTariffWithBlocks = async (client, rateId, effectiveDate = null) => {
  const rateResult = effectiveDate
    ? await client.query(
        `SELECT
          rv.rate_id AS id,
          rv.id AS version_id,
          rv.effective_from,
          rv.name,
          rv.amount,
          rv.tariff_type,
          rv.fixed_charge_amount,
          rv.vat_enabled,
          rv.vat_rate,
          rv.vat_exempt,
          rv.reconnection_fee_amount,
          rv.exemption_notes,
          rv.description,
          r.is_active
         FROM rate_versions rv
         JOIN rates r ON r.id = rv.rate_id
         WHERE rv.rate_id = $1 AND rv.effective_from <= $2::date
         ORDER BY rv.effective_from DESC, rv.id DESC
         LIMIT 1`,
        [rateId, effectiveDate]
      )
    : await client.query("SELECT *, NULL::integer AS version_id FROM rates WHERE id = $1", [rateId]);
  const rate = rateResult.rows[0];
  if (!rate && effectiveDate) {
    return getTariffWithBlocks(client, rateId, null);
  }
  if (!rate) return null;

  const blockResult = rate.version_id
    ? await client.query(
        `SELECT id, min_units, max_units, unit_rate, sort_order
         FROM rate_version_blocks
         WHERE rate_version_id = $1
         ORDER BY sort_order ASC, min_units ASC, id ASC`,
        [rate.version_id]
      )
    : await client.query(
        `SELECT id, min_units, max_units, unit_rate, sort_order
         FROM tariff_blocks
         WHERE rate_id = $1
         ORDER BY sort_order ASC, min_units ASC, id ASC`,
        [rateId]
      );

  return {
    ...rate,
    blocks: blockResult.rows
  };
};

const calculateBlockSubtotal = (unitsUsed, tariff) => {
  const blocks = tariff.blocks || [];
  if (!blocks.length) return roundMoney(unitsUsed * toNumber(tariff.amount));

  let coveredUnits = 0;
  const blockSubtotal = blocks.reduce((sum, block) => {
    const minUnits = toNumber(block.min_units);
    const maxUnits = block.max_units === null || block.max_units === undefined ? unitsUsed : toNumber(block.max_units);
    const blockUnits = Math.max(Math.min(unitsUsed, maxUnits) - minUnits, 0);
    if (blockUnits > 0) coveredUnits = Math.max(coveredUnits, minUnits + blockUnits);
    return sum + blockUnits * toNumber(block.unit_rate);
  }, 0);
  const fallbackSubtotal = Math.max(unitsUsed - coveredUnits, 0) * toNumber(tariff.amount);

  return roundMoney(blockSubtotal + fallbackSubtotal);
};

const calculateTariffCharge = (tariff, unitsUsedValue) => {
  const unitsUsed = toNumber(unitsUsedValue);
  const fallbackRateAmount = tariff.amount ?? tariff.rate ?? 0;
  const isBlockTariff = tariff.tariff_type === "block";
  const subtotalAmount = isBlockTariff
    ? calculateBlockSubtotal(unitsUsed, { ...tariff, amount: fallbackRateAmount })
    : roundMoney(unitsUsed * toNumber(fallbackRateAmount));
  const fixedChargeAmount = roundMoney(tariff.fixed_charge_amount);
  const reconnectionFeeAmount = 0;
  const taxableAmount = subtotalAmount + fixedChargeAmount + reconnectionFeeAmount;
  const vatAmount =
    tariff.vat_enabled && !tariff.vat_exempt ? roundMoney(taxableAmount * (toNumber(tariff.vat_rate) / 100)) : 0;
  const totalAmount = roundMoney(taxableAmount + vatAmount);

  return {
    rateAmount: toNumber(fallbackRateAmount),
    subtotalAmount,
    fixedChargeAmount,
    vatAmount,
    reconnectionFeeAmount,
    totalAmount,
    tariffSnapshot: {
      id: tariff.id,
      version_id: tariff.version_id || null,
      name: tariff.name,
      effective_from: tariff.effective_from || null,
      tariff_type: tariff.tariff_type || "flat",
      flat_rate_amount: toNumber(fallbackRateAmount),
      fixed_charge_amount: fixedChargeAmount,
      vat_enabled: Boolean(tariff.vat_enabled),
      vat_rate: toNumber(tariff.vat_rate),
      vat_exempt: Boolean(tariff.vat_exempt),
      reconnection_fee_amount: toNumber(tariff.reconnection_fee_amount),
      blocks: (tariff.blocks || []).map((block) => ({
        min_units: toNumber(block.min_units),
        max_units: block.max_units === null || block.max_units === undefined ? null : toNumber(block.max_units),
        unit_rate: toNumber(block.unit_rate),
        sort_order: Number(block.sort_order || 0)
      }))
    }
  };
};

module.exports = {
  calculateTariffCharge,
  getTariffWithBlocks
};
