# Assumptions and sources

## Dividend-income default

**Default gross cash-yield planning assumption: 1.9% per year.** This is a conservative, rounded-down reference for an illustrative **60% short-duration EUR government-bond distributing ETF / 40% dividend-aristocrat equity distributing ETF** mix:

- Bond sleeve: iShares € Govt Bond 0–1yr UCITS ETF, distributing share class; its 12-month trailing dividend distribution yield was **1.94% as of 20 October 2026**. The fund reports weighted-average YTM 2.88%, but YTM is not the same as cash distribution yield. Its reported effective duration was 0.51 and TER 0.07%. [Official fund page](https://www.ishares.com/uk/individual/en/products/251741/ishares-euro-government-bond-ucits-etf)
- Equity sleeve: SPDR S&P U.S. Dividend Aristocrats UCITS ETF (Dist); its 12-month distribution yield was **2.02% as of 21 October 2026**, TER 0.35%, with 155 holdings. [Official fund page](https://www.ssga.com/uk/en_gb/intermediary/etfs/funds/spdr-sp-us-dividend-aristocrats-ucits-etf-dist-spyd-gy)
- Weighted gross reference yield: `0.60 × 1.94% + 0.40 × 2.02% = 1.972%`; round down to one decimal place for the app default: **1.9%**.

This is a **cash-yield proxy, not a “safest portfolio” finding or an allocation recommendation**. The 60/40 example is majority short-duration EUR sovereign bonds to make the cash-yield reference more conservative than an all-equity dividend portfolio; no allocation is objectively safest for every user. It is before personal taxes and assumes the cited trailing distributions are a reasonable planning reference; distributions and bond prices/yields change. The two ETFs are examples to ground the calculator default, not a buy list.

## Romanian availability check for yield examples

Checked **22 October 2026**. BlackRock's current registered-locations list for the cited iShares share classes does not list Romania. State Street's fund information lists countries of registration including Austria, Czechia, Denmark, Finland, France, Germany, Ireland, Italy, Luxembourg, Netherlands, Norway, Poland, Slovakia, Spain, Sweden, Switzerland, and the UK; Romania is not listed. The Romanian ASF registry has a public category for foreign open-ended funds whose units are distributed in Romania (FDIA) and reports an update date of **20 October 2026**. The provider pages therefore do not establish Romanian registration for these examples; local broker execution access can differ and was not verified. Do not infer availability from a ticker on an exchange or treat these examples as a Romanian buy list. [ASF Financial Instruments and Investments Registry](https://data.asfromania.ro/registru/registru.php?lng=2) · [ASF FDIA category](https://data.asfromania.ro/registru/lista.php?sect=3602&lng=2)

The reference mix must not be shown as the user's actual holdings or overwrite the existing 100%-stock accumulation assumptions. The editable shared nominal total-return assumption is used by all approaches unless a per-approach override is entered. The 1.9% yield is an income-yield input only; it does not define a capital-return forecast. The default is date-stamped and is intentionally not fetched live on every app launch; user edits remain possible and reset restores 1.9%.

The SPDR fund follows a Dividend Aristocrats index: companies with at least 20 consecutive years of annual dividend increases. That is not the stricter “Dividend Kings” label, commonly used for 50+ years of increases. Dividend growth history does not guarantee future income or capital preservation.

## Accumulating versus distributing share classes

An accumulating share class reinvests distributions inside the fund. It can be a reasonable accumulation-phase reference, but its distribution yield is not cash paid to the retiree. For example, iShares Core MSCI World UCITS ETF (SWDA) lists an accumulating share class, TER 0.20%, and broad developed-market exposure (1,250 holdings as of 16 October 2026). [Official fund page](https://www.ishares.com/uk/individual/en/products/251882/ishares-msci-world-quality-dividend-ucits-etf)

For dividend-only drawdown, use cash distributions from distributing holdings, or explicitly model sales. Do not count an accumulating ETF's reinvested dividends as spendable cash and also count them in total return.

## Why the reference is not “safest”

No asset mix is safest for every horizon, currency, tax residence, and spending need. Short EUR government bonds reduce duration/credit exposure relative to longer-duration or lower-quality bonds, but still have interest-rate, inflation, reinvestment, sovereign, and fund-price risks. Dividend equities retain equity-market and dividend-cut risk. Portfolio safety also depends on asset allocation, time horizon, liquidity needs, tax, and the sequence of returns.

The ECB describes euro-area yield curves as estimates from euro-denominated central-government bonds and distinguishes AAA-rated from all-country curves. Use them as a market reference for future rate refreshes, not a guarantee or a personal quote. [ECB euro-area yield curves](https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_area_yield_curves/html/index.en.html)

## Other defaults

- Nominal total return: 7.0% per year; inflation: 2.5%; annual fee: 0.2%. These are editable planning assumptions, not researched forecasts.
- Total-return withdrawal rate: 3.5%, editable; it is a scenario input, not a promise that the portfolio lasts through age 90.
- Effective dividend tax: 0% default, editable. It is a simplified effective-rate approximation and not Romanian tax advice; capital gains and rental taxes are not modeled.
- Monte Carlo annual volatility: 15% and run count: 1,000 by default. Both are editable planning assumptions, not researched forecasts.
- Power-user setup defaults to 100% current and target equities, preserving the existing all-stock calculation; annual rebalancing is selected by default. Editable equity sleeve assumptions are 7% nominal return, 15% volatility, 0.2% annual fee, and 1.9% cash distribution yield. Editable bond sleeve assumptions are 3% nominal return, 3% volatility, 0.2% annual fee, and 3% cash distribution yield; equity/bond correlation defaults to 0. These are illustrative placeholders, not sourced forecasts. Power-user mode does not identify or verify any fund or broker product available in Romania.
- End age: 90, editable. Terminal balance floor: €0, editable.
- USD→EUR remains a manually editable placeholder. EUR→RON defaults to the editable placeholder 4.97 and can be refreshed on demand from the ECB Data API series (`EXR.D.RON.EUR.SP00.A`); no request runs automatically and no plan inputs are sent. The refresh implementation was checked on 22 October 2026 and returned 5.3365 for the 21 October observation. [ECB Data API series](https://data-api.ecb.europa.eu/service/data/EXR/D.RON.EUR.SP00.A?lastNObservations=1)

## Research review date

Sources and yields checked **22 October 2026**. Fund yields cited above are provider data from 20–21 October 2026 and can change. The current 1.9% default remains a rounded-down planning proxy; recheck provider pages before changing it.
