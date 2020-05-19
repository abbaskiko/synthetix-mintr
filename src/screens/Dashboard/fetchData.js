import { addSeconds } from 'date-fns';
import snxJSConnector from '../../helpers/snxJSConnector';

import { bytesFormatter } from '../../helpers/formatters';

const bigNumberFormatter = value => Number(snxJSConnector.utils.formatEther(value));

const convertFromSynth = (fromSynthRate, toSynthRate) => {
	return fromSynthRate * (1 / toSynthRate);
};

// exported for tests
export const getSusdInUsd = (synthRates, sethToEthRate) => {
	const sEth = convertFromSynth(synthRates.susd, synthRates.seth);
	const eth = sEth * sethToEthRate;
	return eth * synthRates.seth;
};
const getSETHtoETH = async () => {
	const sEthAddress = snxJSConnector.snxJS.sETH.contract.address;
	const query = `query {
		exchanges(where: {tokenAddress:"${sEthAddress}"}) {
			price
		}
	}`;
	const response = await fetch('https://api.thegraph.com/subgraphs/name/graphprotocol/uniswap', {
		method: 'POST',
		body: JSON.stringify({ query, variables: null }),
	}).then(x => x.json());
	return (
		response &&
		response.data &&
		response.data.exchanges &&
		response.data.exchanges[0] &&
		1 / response.data.exchanges[0].price
	);
};

const getPrices = async () => {
	try {
		const synthsP = snxJSConnector.snxJS.ExchangeRates.ratesForCurrencies(
			['SNX', 'sUSD', 'sETH'].map(bytesFormatter)
		);
		const sethToEthRateP = getSETHtoETH();
		const [synths, sethToEthRate] = await Promise.all([synthsP, sethToEthRateP]);
		const [snx, susd, seth] = synths.map(bigNumberFormatter);

		const susdInUsd = getSusdInUsd(
			{
				susd,
				seth,
			},
			sethToEthRate
		);
		return { snx, susd: susdInUsd, eth: seth };
	} catch (e) {
		console.log(e);
	}
};
const getRewards = async walletAddress => {
	try {
		const [feesAreClaimable, currentFeePeriod, feePeriodDuration] = await Promise.all([
			snxJSConnector.snxJS.FeePool.isFeesClaimable(walletAddress),
			snxJSConnector.snxJS.FeePool.recentFeePeriods(0),
			snxJSConnector.snxJS.FeePool.feePeriodDuration(),
		]);

		const currentPeriodStart =
			currentFeePeriod && currentFeePeriod.startTime
				? new Date(parseInt(currentFeePeriod.startTime * 1000))
				: null;
		const currentPeriodEnd =
			currentPeriodStart && feePeriodDuration
				? addSeconds(currentPeriodStart, feePeriodDuration)
				: null;
		return { feesAreClaimable, currentPeriodEnd };
	} catch (e) {
		console.log(e);
	}
};

const getDebt = async walletAddress => {
	try {
		const result = await Promise.all([
			snxJSConnector.snxJS.SynthetixState.issuanceRatio(),
			snxJSConnector.snxJS.Synthetix.collateralisationRatio(walletAddress),
			snxJSConnector.snxJS.Synthetix.transferableSynthetix(walletAddress),
			snxJSConnector.snxJS.Synthetix.debtBalanceOf(walletAddress, bytesFormatter('sUSD')),
		]);
		const [targetCRatio, currentCRatio, transferable, debtBalance] = result.map(bigNumberFormatter);
		return {
			targetCRatio,
			currentCRatio,
			transferable,
			debtBalance,
		};
	} catch (e) {
		console.log(e);
	}
};

const getEscrow = async walletAddress => {
	try {
		const results = await Promise.all([
			snxJSConnector.snxJS.RewardEscrow.totalEscrowedAccountBalance(walletAddress),
			snxJSConnector.snxJS.SynthetixEscrow.balanceOf(walletAddress),
		]);
		const [reward, tokenSale] = results.map(bigNumberFormatter);
		return {
			reward,
			tokenSale,
		};
	} catch (e) {
		console.log(e);
	}
};

export const fetchData = async walletAddress => {
	const [prices, rewardData, debtData, escrowData] = await Promise.all([
		getPrices(),
		getRewards(walletAddress),
		getDebt(walletAddress),
		getEscrow(walletAddress),
	]).catch(e => console.log(e));

	return {
		prices,
		rewardData,
		debtData,
		escrowData,
	};
};
