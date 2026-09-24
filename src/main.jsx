import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
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
  const socketRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('friends');
  const [lobbyNotice, setLobbyNotice] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const secondsLeft = room ? Math.max(0, Math.ceil((room.localEndsAt - clock) / 1000)) : 0;

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    let rollTimer;
    const clockTimer = window.setInterval(() => setClock(Date.now()), 100);
    socket.on('connect', () => {
      setIsLoadingBalance(false);
      setMessage({ type: 'info', text: 'Join a room to play. Share its code with up to three friends.' });
    });
    socket.on('connect_error', () => {
      setMessage({ type: 'error', text: 'Could not connect to the game server. Retrying…' });
    });
    socket.on('disconnect', () => {
      setIsLoadingBalance(true);
      setRoom(null);
      setActiveBet(null);
      setBalanceCents(0);
      setHistory([]);
      setDieValue(null);
      setIsRolling(false);
      window.clearTimeout(rollTimer);
      setLobbyNotice('');
      setMessage({ type: 'error', text: 'Disconnected. Rejoin a room after reconnecting; connection-based credits reset.' });
    });
    socket.on('room_state', (state) => {
      const localNow = Date.now();
      setClock(localNow);
      setRoom({ ...state, localEndsAt: localNow + state.endsAt - state.serverNow });
    });
    socket.on('player_joined', ({ playerId }) => {
      setLobbyNotice(playerId === socket.id ? 'You joined the room.' : 'A player joined the room.');
    });
    socket.on('player_left', () => setLobbyNotice('A player left the room.'));
    socket.on('dice_rolled', ({ outcome }) => {
      window.clearTimeout(rollTimer);
      setIsRolling(true);
      setDieValue(outcome);
      rollTimer = window.setTimeout(() => setIsRolling(false), ROLL_DURATION_MS);
    });
    socket.on('balance_update', (state) => {
      setBalanceCents(state.balanceCents);
      setActiveBet(state.activeBet);
      setHistory(state.history);
      if (typeof state.won === 'boolean') {
        setMessage({
          type: state.won ? 'success' : 'loss',
          text: state.won
            ? `You called it! ${formatCoins(state.payoutCents)} coins returned — ${formatCoins(state.netCents)} coins profit.`
            : `The dice had other plans. ${formatCoins(-state.netCents)} coins lost.`,
        });
      }
    });
    return () => {
      window.clearInterval(clockTimer);
      window.clearTimeout(rollTimer);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
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

  async function send(event, payload = {}) {
    if (!socketRef.current?.connected) throw new Error('You are not connected to the game server.');
    const result = await socketRef.current.timeout(5000).emitWithAck(event, payload);
    if (!result.ok) throw new Error(result.error);
    return result;
  }

  async function changeRoom() {
    setIsPending(true);
    try {
      if (room) {
        await send('leave_room');
        setRoom(null);
        setDieValue(null);
        setLobbyNotice('You left the room.');
      } else {
        await send('join_room', { roomId: roomCode.trim() });
      }
      setMessage(null);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsPending(false);
    }
  }

  async function placeBet() {
    if (isPending || isLoadingBalance || !room || activeBet || secondsLeft === 0) return;
    if (!isBetValid) {
      setMessage({ type: 'error', text: 'Choose a prediction and enter a whole-number bet within your balance.' });
      return;
    }

    setIsPending(true);
    setMessage(null);
    try {
      await send('place_bet', { betType, prediction, betAmount: betNumber, roundId: room.roundId });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsPending(false);
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
          <Chip className="solo-chip" label={room ? `${room.players.length}/4 PLAYERS` : 'MULTIPLAYER'} size="small" />
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
              Place your bet in 10 seconds. One roll for the whole room.
            </Typography>
            <Paper elevation={0} sx={{ p: 2, mb: 2 }}>
              <Typography className="micro-label">YOUR ROOM</Typography>
              <TextField
                label="Room code"
                value={room ? room.roomId : roomCode}
                onChange={(event) => setRoomCode(event.target.value)}
                disabled={Boolean(room) || isPending}
                size="small"
                margin="normal"
                fullWidth
                inputProps={{ maxLength: 32 }}
                helperText="Share this code with friends. Up to 4 players."
              />
              <Button
                variant="outlined"
                onClick={changeRoom}
                disabled={isLoadingBalance || isPending || Boolean(activeBet)}
              >
                {room ? 'Leave room' : 'Join room'}
              </Button>
              <Typography role="status" sx={{ mt: 1 }}>{lobbyNotice}</Typography>
              {room && <Typography>{room.players.length}/4 players · Betting closes in {secondsLeft}s</Typography>}
            </Paper>
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
              <Chip label={room ? `${secondsLeft}s to roll` : '1–6'} size="small" className="range-chip" />
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
                onClick={placeBet}
                disabled={isRolling || isLoadingBalance || isPending || !room || secondsLeft === 0 || Boolean(activeBet) || balanceCents < COIN_CENTS}
                className="roll-button"
                startIcon={<CasinoRoundedIcon />}
              >
                {isLoadingBalance
                  ? 'Connecting…'
                  : isRolling
                    ? 'Rolling…'
                    : activeBet
                      ? 'Bet placed — waiting for the room'
                      : !room
                        ? 'Join a room to bet'
                        : balanceCents < COIN_CENTS ? 'Out of coins' : 'Place bet'}
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
          <span>Up to 4 players · Shared rolls every 10 seconds</span>
        </footer>
      </main>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
