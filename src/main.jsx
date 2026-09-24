import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Button,
  Chip,
  CssBaseline,
  Divider,
  IconButton,
  Paper,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  createTheme,
} from '@mui/material';
import CasinoRoundedIcon from '@mui/icons-material/CasinoRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { BET_TYPES, COIN_CENTS } from './game.js';
import './styles.css';

const THEME_STORAGE_KEY = 'roll-the-dice:theme:v1';
const ROLL_DURATION_MS = 850;

function createGameTheme(mode) {
  const isLight = mode === 'light';
  return createTheme({
    palette: {
      mode,
      primary: { main: isLight ? '#66821f' : '#d8ff67', contrastText: isLight ? '#ffffff' : '#14180c' },
      secondary: { main: '#a694ff' },
      background: { default: isLight ? '#f4f6ee' : '#10130f', paper: isLight ? '#ffffff' : '#191d18' },
      text: { primary: isLight ? '#20251b' : '#f3f2e9', secondary: isLight ? '#68705f' : '#9b9f95' },
      success: { main: isLight ? '#477820' : '#a7e87b' },
      error: { main: '#ff8d83' },
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: '"DM Sans", "Segoe UI", sans-serif',
      button: { fontWeight: 700, textTransform: 'none' },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiButton: { defaultProps: { disableElevation: true } },
    },
  });
}

function getSavedTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch (error) {
    console.error('Unable to read the saved dice-game theme.', error);
    return 'dark';
  }
}

function formatCoins(cents) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(cents / COIN_CENTS);
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data;
}

function Dice({ value, rolling }) {
  const faceTransforms = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(-90deg) rotateY(0deg)',
    3: 'rotateX(0deg) rotateY(-90deg)',
    4: 'rotateX(0deg) rotateY(90deg)',
    5: 'rotateX(90deg) rotateY(0deg)',
    6: 'rotateX(0deg) rotateY(180deg)',
  };

  return (
    <div className="dice-stage" role="img" aria-label={rolling ? 'Dice rolling' : value ? `Dice showing ${value}` : 'Dice ready'}>
      <div className={`dice-cube ${rolling ? 'is-rolling' : ''}`} style={{ '--face-transform': faceTransforms[value] ?? faceTransforms[1] }}>
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <div className={`dice-face face-${face}`} key={face} aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span className={pipFor(face, index) ? 'pip is-visible' : 'pip'} key={index} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function pipFor(face, index) {
  const patterns = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  return patterns[face].includes(index);
}

function App() {
  const [balanceCents, setBalanceCents] = useState(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [activeBet, setActiveBet] = useState(null);
  const [themeMode, setThemeMode] = useState(getSavedTheme);
  const theme = createGameTheme(themeMode);
  const [betType, setBetType] = useState('exact');
  const [prediction, setPrediction] = useState(6);
  const [betAmount, setBetAmount] = useState('10');
  const [dieValue, setDieValue] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [message, setMessage] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadGame() {
      try {
        const snapshot = await requestJson('/api/balance');
        if (cancelled) return;
        setBalanceCents(snapshot.balanceCents);
        setActiveBet(snapshot.activeBet);
        setHistory(snapshot.history);
        if (snapshot.activeBet) {
          setBetType(snapshot.activeBet.betType);
          setPrediction(snapshot.activeBet.prediction);
          setBetAmount(String(snapshot.activeBet.betAmount));
        }
        if (snapshot.history.length) setDieValue(snapshot.history[0].outcome);
      } catch (error) {
        if (!cancelled) {
          console.error('Unable to retrieve the game balance from the server.', error);
          setMessage({ type: 'error', text: `Could not connect to the game server: ${error.message}` });
        }
      } finally {
        if (!cancelled) setIsLoadingBalance(false);
      }
    }

    loadGame();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch (error) {
      console.error('Unable to save the dice-game theme.', error);
    }
  }, [themeMode]);

  const selectedBet = BET_TYPES[betType];
  const betNumber = Number(betAmount);
  const isBetValid = Number.isSafeInteger(betNumber)
    && betNumber >= 1
    && betNumber * COIN_CENTS <= balanceCents
    && selectedBet.values.includes(prediction);
  const potentialReturnCents = isBetValid
    ? betNumber * (betType === 'exact' ? 500 : 180)
    : 0;

  function chooseBetType(_event, nextType) {
    if (!nextType || activeBet) return;
    setBetType(nextType);
    setPrediction(BET_TYPES[nextType].values[0]);
    setMessage(null);
  }

  async function roll() {
    if (isRolling || isLoadingBalance) return;
    if (!isBetValid) {
      setMessage({ type: 'error', text: 'Choose a prediction and enter a whole-number bet within your balance.' });
      return;
    }

    setIsRolling(true);
    setDieValue(null);
    setMessage(null);
    try {
      if (!activeBet) {
        const placedBet = await requestJson('/api/bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ betType, prediction, betAmount: betNumber }),
        });
        setActiveBet(placedBet.activeBet);
      }

      const result = await requestJson('/api/roll', { method: 'POST' });
      await new Promise((resolve) => window.setTimeout(resolve, ROLL_DURATION_MS));
      setDieValue(result.outcome);
      setBalanceCents(result.balanceCents);
      setActiveBet(result.activeBet);
      setHistory(result.history);
      setMessage({
        type: result.won ? 'success' : 'loss',
        text: result.won
          ? `You called it! ${formatCoins(result.payoutCents)} coins returned — ${formatCoins(result.netCents)} coins profit.`
          : `The dice had other plans. ${formatCoins(betNumber * COIN_CENTS)} coins lost.`,
      });
    } catch (error) {
      console.error('The game bet or roll request failed.', error);
      setMessage({ type: 'error', text: error.message });
      try {
        const snapshot = await requestJson('/api/balance');
        setBalanceCents(snapshot.balanceCents);
        setActiveBet(snapshot.activeBet);
        setHistory(snapshot.history);
      } catch (refreshError) {
        console.error('Unable to refresh the game state after a failed request.', refreshError);
      }
    } finally {
      setIsRolling(false);
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <main className="app-shell" data-theme={themeMode}>
        <header className="topbar">
          <a className="brand" href="/" aria-label="Roll the Dice home">
            <span className="brand-mark"><CasinoRoundedIcon /></span>
            <span>ROLL<span className="brand-dot">.</span>THE DICE</span>
          </a>
          <Chip className="solo-chip" label="SOLO TABLE" size="small" />
          <IconButton
            className="theme-toggle"
            aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setThemeMode((mode) => mode === 'dark' ? 'light' : 'dark')}
            size="small"
          >
            {themeMode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
          </IconButton>
        </header>

        <section className="game-layout">
          <div className="game-copy">
            <Typography className="eyebrow"><span className="live-dot" /> YOUR TABLE IS READY</Typography>
            <Typography component="h1" className="headline">
              Make your call.<br /><span>Trust the roll.</span>
            </Typography>
            <Typography className="subhead">
              Pick your odds, place a bet, and see where the dice land.
            </Typography>
            <Paper className="balance-card" elevation={0}>
              <div className="balance-icon"><CasinoRoundedIcon /></div>
              <div className="balance-copy">
                <Typography className="micro-label">YOUR BALANCE</Typography>
                <Typography className="balance-number">{formatCoins(balanceCents)} <span>coins</span></Typography>
              </div>
              <div className="balance-note"><LocalFireDepartmentRoundedIcon /> Every roll counts</div>
            </Paper>
            <div className="payout-note">
              <span className="payout-star">✳</span>
              <Typography>
                Exact hit pays <strong>5×</strong>. Category hit pays <strong>1.8×</strong>.
                <span className="payout-footnote"> Winning returns include your original bet.</span>
              </Typography>
            </div>
          </div>

          <Paper className="game-card" elevation={0}>
            <div className="card-topline">
              <div>
                <Typography className="micro-label">THE NEXT ROLL</Typography>
                <Typography className="card-title">What’s your prediction?</Typography>
              </div>
              <Chip label="1–6" size="small" className="range-chip" />
            </div>

            <div className={`dice-table ${isRolling ? 'table-rolling' : ''}`}>
              <div className="table-glow" />
              <Dice value={dieValue} rolling={isRolling} />
              <div className="table-caption">
                {isRolling ? 'LET IT ROLL…' : dieValue ? `THE DICE LANDED ON ${dieValue}` : 'READY WHEN YOU ARE'}
              </div>
            </div>

            <div className="bet-section">
              <Typography className="section-label">01 <span>CHOOSE YOUR BET</span></Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                value={betType}
                onChange={chooseBetType}
                className="bet-type-group"
                aria-label="Bet category"
                disabled={isRolling || Boolean(activeBet)}
              >
                <ToggleButton value="exact">Exact number <span>5×</span></ToggleButton>
                <ToggleButton value="highLow">High / low <span>1.8×</span></ToggleButton>
                <ToggleButton value="parity">Even / odd <span>1.8×</span></ToggleButton>
              </ToggleButtonGroup>

              <Typography className="section-label choice-label">02 <span>MAKE YOUR PICK</span></Typography>
              <ToggleButtonGroup
                exclusive
                value={prediction}
                onChange={(_event, nextValue) => {
                  if (nextValue !== null) {
                    setPrediction(nextValue);
                    setMessage(null);
                  }
                }}
                className={`prediction-group ${betType === 'exact' ? 'number-predictions' : ''}`}
                aria-label={selectedBet.label}
                disabled={isRolling || Boolean(activeBet)}
              >
                {selectedBet.values.map((value) => (
                  <ToggleButton value={value} key={value}>
                    {betType === 'exact'
                      ? <span className="number-choice">{value}</span>
                      : betType === 'highLow'
                        ? `${value} · ${value === 'Low' ? '1–3' : '4–6'}`
                        : value}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <div className="wager-row">
                <div className="wager-field">
                  <Typography className="section-label">03 <span>YOUR BET</span></Typography>
                  <TextField
                    type="number"
                    value={betAmount}
                    onChange={(event) => {
                      setBetAmount(event.target.value);
                      setMessage(null);
                    }}
                    inputProps={{ min: 1, max: Math.floor(balanceCents / COIN_CENTS), step: 1, inputMode: 'numeric', 'aria-label': 'Bet amount in coins' }}
                    disabled={isRolling || Boolean(activeBet)}
                    size="small"
                    className="bet-input"
                    error={betAmount !== '' && !isBetValid}
                    helperText={`Up to ${Math.floor(balanceCents / COIN_CENTS).toLocaleString('en-US')} coins`}
                  />
                </div>
                <div className="return-preview" aria-live="polite">
                  <Typography className="micro-label">POTENTIAL RETURN</Typography>
                  <Typography className="return-amount">{formatCoins(potentialReturnCents)} <span>coins</span></Typography>
                </div>
              </div>

              {message && (
                <Alert severity={message.type === 'loss' ? 'info' : message.type} className="game-alert" role="status">
                  {message.text}
                </Alert>
              )}

              <Button
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                onClick={roll}
                disabled={isRolling || isLoadingBalance || (!activeBet && balanceCents < COIN_CENTS)}
                className="roll-button"
                startIcon={<CasinoRoundedIcon />}
              >
                {isLoadingBalance
                  ? 'Connecting…'
                  : isRolling
                    ? 'Rolling…'
                    : activeBet
                      ? 'Roll your bet'
                      : balanceCents < COIN_CENTS
                        ? 'Out of coins'
                        : 'Roll the dice'}
              </Button>
              <Typography className="fair-play-note">
                Virtual coins only · No purchase, no cash value
              </Typography>
            </div>
          </Paper>
        </section>

        <Paper className="history-card" elevation={0}>
          <div className="history-heading">
            <div className="history-title">
              <span className="history-icon"><HistoryRoundedIcon /></span>
              <div>
                <Typography className="micro-label">THE RECAP</Typography>
                <Typography className="history-name">Recent rolls</Typography>
              </div>
            </div>
            <Typography className="history-count">{history.length ? `LAST ${history.length}` : 'NO ROLLS YET'}</Typography>
          </div>
          <Divider className="history-divider" />
          {history.length === 0 ? (
            <Typography className="empty-history">Your rolls will show up here. Make the first one count.</Typography>
          ) : (
            <div className="history-list">
              {history.map((entry) => (
                <div className="history-item" key={entry.id}>
                  <span className={`history-die ${entry.won ? 'history-won' : ''}`}>{entry.outcome}</span>
                  <div className="history-bet">
                    <Typography className="history-bet-title">
                      {entry.betType === 'exact' ? `Exact ${entry.prediction}` : `${BET_TYPES[entry.betType].label}: ${entry.prediction}`}
                    </Typography>
                    <Typography className="history-bet-caption">{formatCoins(entry.betAmount * COIN_CENTS)} coin bet</Typography>
                  </div>
                  <Chip
                    size="small"
                    className={`result-chip ${entry.won ? 'won-chip' : 'lost-chip'}`}
                    label={entry.won ? `+${formatCoins(entry.payoutCents - entry.betAmount * COIN_CENTS)}` : 'Lost'}
                  />
                </div>
              ))}
            </div>
          )}
        </Paper>

        <footer className="page-footer">
          <span>ROLL THE DICE <span className="footer-dot">✳</span> PLAY YOUR ODDS</span>
          <span>Single player · Up to 4 players coming later</span>
        </footer>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
