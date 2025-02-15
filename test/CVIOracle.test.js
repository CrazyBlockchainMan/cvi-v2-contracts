const {expectRevert, BN, time} = require('@openzeppelin/test-helpers');
const {accounts, contract} = require('@openzeppelin/test-environment');
const chai = require('chai');

const CVIOracle = contract.fromArtifact('CVIOracle');
const FakePriceProvider = contract.fromArtifact('FakePriceProvider');

const {toBN, toCVI} = require('./utils/BNUtils.js');

const expect = chai.expect;
const [admin, alice] = accounts;

const MAX_CVI_VALUE = toBN(200, 18);
const ETH_VOL_MAX_CVI_VALUE = toBN(220, 18);

const MAX_TRUNCATED_CVI_VALUE = new BN(20000);
const ETH_VOL_MAX_TRUNCATED_CVI_VALUE = new BN(22000);

const CVI_DECIMALS_TRUNCATE = toBN(1, 16);

const testLatestRoundData = async (cviValue, round, timestamp) => {
    const result = await this.oracle.getCVILatestRoundData();
    expect(result[0]).to.be.bignumber.equal(cviValue);
    expect(result[1]).to.be.bignumber.equal(round);
    expect(result[2]).to.be.bignumber.equal(timestamp);
};

const testRoundData = async (round, cviValue, timestamp) => {
    const result = await this.oracle.getCVIRoundData(round);
    expect(result[0]).to.be.bignumber.equal(cviValue);
    expect(result[1]).to.be.bignumber.equal(timestamp);
};

const beforeEachPlatform = async (maxCVIValue, maxTruncatedCVIValue) => {
    this.fakePriceProvider = await FakePriceProvider.new(toCVI(5000), {from: admin});
    this.fakeSanityPriceProvider = await FakePriceProvider.new(toCVI(5000), {from: admin});
    this.oracle = await CVIOracle.new(this.fakePriceProvider.address, this.fakeSanityPriceProvider.address, maxCVIValue, {from: admin});
    this.maxCVIValue = maxCVIValue;
    this.maxTruncatedCVIValue = maxTruncatedCVIValue;
};

const setOracleTests = () => {
    it('returns latest round data properly', async () => {
        let round = 2;
        await this.fakePriceProvider.setPrice(toCVI(6000));
        const timestamp = await time.latest();

        await testLatestRoundData(new BN(6000), new BN(round), timestamp);

        await time.increase(3600);
        await this.fakePriceProvider.setPrice(toCVI(7000));
        const timestamp2 = await time.latest();

        await testLatestRoundData(new BN(7000), new BN(round + 1), timestamp2);
    });

    it('truncates to maximum only if larger than max on latest round', async () => {
        let round = 2;
        await this.fakePriceProvider.setPrice(this.maxCVIValue.sub(new BN(1)));
        let timestamp = await time.latest();

        await testLatestRoundData(this.maxTruncatedCVIValue.sub(new BN(1)), new BN(round), timestamp);

        await this.fakePriceProvider.setPrice(this.maxCVIValue);
        timestamp = await time.latest();

        await testLatestRoundData(this.maxTruncatedCVIValue, new BN(round + 1), timestamp);

        await this.fakePriceProvider.setPrice(this.maxCVIValue.add(new BN(1)));
        timestamp = await time.latest();

        await testLatestRoundData(this.maxTruncatedCVIValue, new BN(round + 2), timestamp);

        await this.fakePriceProvider.setPrice(this.maxCVIValue.mul(new BN(2)));
        timestamp = await time.latest();

        await testLatestRoundData(this.maxTruncatedCVIValue, new BN(round + 3), timestamp);
    });

    it('returns sepcific round data properly', async () => {
        await this.fakePriceProvider.setPrice(toCVI(6000));
        const timestamp = await time.latest();
        await time.increase(3600);

        await this.fakePriceProvider.setPrice(toCVI(7000));
        const timestamp2 = await time.latest();
        await time.increase(3600);

        await this.fakePriceProvider.setPrice(toCVI(8000));
        const timestamp3 = await time.latest();

        await testRoundData(new BN(2), new BN(6000), timestamp);
        await testRoundData(new BN(3), new BN(7000), timestamp2);
        await testRoundData(new BN(4), new BN(8000), timestamp3);
    });

    it('truncates to maximum only if larger than max on specific round', async () => {
        await this.fakePriceProvider.setPrice(this.maxCVIValue.sub(new BN(1)));
        const timestamp = await time.latest();
        await time.increase(3600);

        await this.fakePriceProvider.setPrice(this.maxCVIValue);
        const timestamp2 = await time.latest();
        await time.increase(3600);

        await this.fakePriceProvider.setPrice(this.maxCVIValue.add(new BN(1)));
        const timestamp3 = await time.latest();
        await time.increase(3600);

        await this.fakePriceProvider.setPrice(this.maxCVIValue.mul(new BN(2)));
        const timestamp4 = await time.latest();

        await testRoundData(new BN(2), this.maxTruncatedCVIValue.sub(new BN(1)), timestamp);
        await testRoundData(new BN(3), this.maxTruncatedCVIValue, timestamp2);
        await testRoundData(new BN(4), this.maxTruncatedCVIValue, timestamp3);
        await testRoundData(new BN(5), this.maxTruncatedCVIValue, timestamp4);
    });

    it('checks deviation properly and 10% is the default', async () => {
        await this.oracle.setDeviationCheck(true, {from: admin});
        expect(await this.oracle.maxDeviation()).to.be.bignumber.equal(new BN(1000));

        await this.fakePriceProvider.setPrice(toCVI(5501));
        let timestamp = await time.latest();
        await this.fakeSanityPriceProvider.setPrice(toCVI(5000));

        await expectRevert(testLatestRoundData(new BN(5501), new BN(2), timestamp), 'Deviation too large');

        await this.fakeSanityPriceProvider.setPrice(toCVI(5002));
        await testLatestRoundData(new BN(5501), new BN(2), timestamp);

        await this.fakePriceProvider.setPrice(toCVI(5000));
        timestamp = await time.latest();
        await this.fakeSanityPriceProvider.setPrice(toCVI(5501));
        await testLatestRoundData(new BN(5000), new BN(3), timestamp);

        await this.fakeSanityPriceProvider.setPrice(toCVI(4545));
        await expectRevert(testLatestRoundData(new BN(5000), new BN(3), timestamp), 'Deviation too large');
    });

    it('sets max deviation properly', async () => {
        await this.oracle.setDeviationCheck(true, {from: admin});
        expect(await this.oracle.maxDeviation()).to.be.bignumber.equal(new BN(1000));

        await this.fakePriceProvider.setPrice(toCVI(5501));
        await this.fakeSanityPriceProvider.setPrice(toCVI(5000));
        let timestamp = await time.latest();

        await expectRevert(testLatestRoundData(new BN(5501), new BN(2), timestamp), 'Deviation too large');

        await this.oracle.setMaxDeviation(new BN(1002), {from: admin});
        await testLatestRoundData(new BN(5501), new BN(2), timestamp);
    });

    it('sets deviation check bool properly and is disabled by default', async () => {
        expect(await this.oracle.deviationCheck()).to.be.false;

        await this.fakePriceProvider.setPrice(toCVI(5000));
        await this.fakeSanityPriceProvider.setPrice(toCVI(6000));
        let timestamp = await time.latest();

        await testLatestRoundData(new BN(5000), new BN(2), timestamp);

        await this.oracle.setDeviationCheck(true, {from: admin});
        expect(await this.oracle.deviationCheck()).to.be.true;

        await expectRevert(testLatestRoundData(new BN(5000), new BN(2), timestamp), 'Deviation too large');
    });

    it('reverts when getting price that is zero', async () => {
        await this.fakePriceProvider.setPrice(new BN(0));
        await expectRevert(this.oracle.getCVILatestRoundData(), 'CVI must be positive');
        await expectRevert(this.oracle.getCVIRoundData(2), 'CVI must be positive');
    });

    it('reverts when getting price that truncates to zero', async () => {
        await this.fakePriceProvider.setPrice(CVI_DECIMALS_TRUNCATE.sub(new BN(1)));
        await expectRevert(this.oracle.getCVILatestRoundData(), 'CVI must be positive');
        await expectRevert(this.oracle.getCVIRoundData(2), 'CVI must be positive');
    });

    it('reverts when getting truncated price that is zero because of bad max CVI', async () => {
        this.oracle = await CVIOracle.new(this.fakePriceProvider.address, this.fakeSanityPriceProvider.address, new BN(0), {from: admin});
        await this.fakePriceProvider.setPrice(toCVI(this.maxCVIValue).add(new BN(1)));
        await expectRevert(this.oracle.getCVILatestRoundData(), 'CVI must be positive');
        await expectRevert(this.oracle.getCVIRoundData(2), 'CVI must be positive');
    });

    it('reverts setters when not called by owner', async () => {
        await expectRevert(this.oracle.setDeviationCheck(true, {from: alice}), 'Ownable: caller is not the owner');
        await expectRevert(this.oracle.setMaxDeviation(2000, {from: alice}), 'Ownable: caller is not the owner');
    });
};

describe('ETHVolOracle', () => {
    beforeEach(async () => {
        await beforeEachPlatform(ETH_VOL_MAX_CVI_VALUE, ETH_VOL_MAX_TRUNCATED_CVI_VALUE);
    });

    setOracleTests();
});

describe('CVIOracle', () => {
    beforeEach(async () => {
        await beforeEachPlatform(MAX_CVI_VALUE, MAX_TRUNCATED_CVI_VALUE);
    });

    setOracleTests();
});
