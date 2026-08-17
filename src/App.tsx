import { useEffect, useRef, useState, useCallback } from "react";
import {
  Trophy,
  RotateCcw,
  Gauge,
  Car,
  Settings,
  Play,
  Pause,
  X,
  Volume2,
  VolumeX,
  Music,
  Volume1,
  Download,
  Check,
} from "lucide-react";
import { AudioEngine } from "@/audio";

type GameStatus = "ready" | "playing" | "paused" | "over";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface EnemyCar {
  x: number;
  y: number;
  speed: number;
}

const ROAD_WIDTH = 400;
const GAME_HEIGHT = 600;
const ROAD_MARGIN = 40;
const LANES = [70, 165, 260, 330];

const PLAYER_W = 44;
const PLAYER_H = 76;
const PLAYER_SPEED = 6;
const ENEMY_W = 44;
const ENEMY_H = 76;
const BASE_ENEMY_SPEED = 4;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<GameStatus>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [speedLevel, setSpeedLevel] = useState(1);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const installedHandler = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }, [installEvent]);
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  const [musicVol, setMusicVol] = useState(0.25);
  const [sfxVol, setSfxVol] = useState(0.5);

  const audioRef = useRef<AudioEngine | null>(null);

  const stateRef = useRef({
    playerX: ROAD_WIDTH / 2 - PLAYER_W / 2,
    enemies: [] as EnemyCar[],
    lineOffset: 0,
    speed: BASE_ENEMY_SPEED,
    score: 0,
    status: "ready" as GameStatus,
    keys: { left: false, right: false },
    pointer: { active: false, x: 0 },
    lastTime: 0,
    spawnTimer: 0,
    particles: [] as { x: number; y: number; vy: number; life: number; color: string }[],
  });

  const resetGame = useCallback(() => {
    const s = stateRef.current;
    s.playerX = ROAD_WIDTH / 2 - PLAYER_W / 2;
    s.enemies = [];
    s.lineOffset = 0;
    s.speed = BASE_ENEMY_SPEED;
    s.score = 0;
    s.spawnTimer = 0;
    s.particles = [];
    setScore(0);
    setSpeedLevel(1);
  }, []);

  const startGame = useCallback(() => {
    audioRef.current?.init();
    audioRef.current?.resume();
    audioRef.current?.playClick();
    if (musicOn) audioRef.current?.startMusic();
    audioRef.current?.startEngine();
    resetGame();
    stateRef.current.status = "playing";
    setStatus("playing");
  }, [resetGame, musicOn]);

  const pauseGame = useCallback(() => {
    audioRef.current?.playClick();
    audioRef.current?.stopEngine();
    audioRef.current?.stopMusic();
    stateRef.current.status = "paused";
    setStatus("paused");
  }, []);

  const resumeGame = useCallback(() => {
    audioRef.current?.playClick();
    if (musicOn) audioRef.current?.startMusic();
    audioRef.current?.startEngine();
    stateRef.current.status = "playing";
    setStatus("playing");
  }, [musicOn]);

  const endGame = useCallback(() => {
    audioRef.current?.stopEngine();
    audioRef.current?.stopMusic();
    audioRef.current?.playCrash();
    stateRef.current.status = "over";
    setStatus("over");
    setBest((b) => Math.max(b, stateRef.current.score));
  }, []);

  // init audio engine
  useEffect(() => {
    audioRef.current = new AudioEngine();
    return () => {
      audioRef.current?.destroy();
    };
  }, []);

  // sync volume settings
  useEffect(() => {
    audioRef.current?.setMusicVolume(musicOn ? musicVol : 0);
  }, [musicOn, musicVol]);

  useEffect(() => {
    audioRef.current?.setSfxVolume(sfxOn ? sfxVol : 0);
  }, [sfxOn, sfxVol]);

  // draw helpers
  const drawCar = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    body: string,
    accent: string,
    isPlayer: boolean,
  ) => {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 4, w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const r = 8;
    ctx.fillStyle = body;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, "rgba(255,255,255,0.25)");
    grad.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    ctx.fillStyle = "rgba(20,30,45,0.85)";
    roundRect(ctx, x + 6, y + (isPlayer ? 10 : h - 28), w - 12, 18, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(20,30,45,0.7)";
    roundRect(ctx, x + 6, y + (isPlayer ? h - 26 : 10), w - 12, 14, 4);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.fillRect(x + w / 2 - 3, y + 30, 6, h - 60);

    ctx.fillStyle = isPlayer ? "#ffe08a" : "#ff5a5a";
    ctx.fillRect(x + 5, y + 2, 8, 4);
    ctx.fillRect(x + w - 13, y + 2, 8, 4);
    ctx.fillStyle = isPlayer ? "#ff4d4d" : "#ffd966";
    ctx.fillRect(x + 5, y + h - 6, 8, 4);
    ctx.fillRect(x + w - 13, y + h - 6, 8, 4);

    ctx.fillStyle = "#15171c";
    ctx.fillRect(x - 3, y + 12, 5, 16);
    ctx.fillRect(x + w - 2, y + 12, 5, 16);
    ctx.fillRect(x - 3, y + h - 28, 5, 16);
    ctx.fillRect(x + w - 2, y + h - 28, 5, 16);
  };

  const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const spawnEnemy = () => {
      const s = stateRef.current;
      const lane = Math.floor(Math.random() * LANES.length);
      const x = LANES[lane];
      const overlap = s.enemies.some(
        (e) => Math.abs(e.x - x) < ENEMY_W && e.y < ENEMY_H * 1.5,
      );
      if (overlap) return;
      s.enemies.push({ x, y: -ENEMY_H, speed: s.speed + Math.random() * 1.2 });
    };

    const loop = (time: number) => {
      const s = stateRef.current;
      const dt = s.lastTime ? Math.min((time - s.lastTime) / 16.67, 2.5) : 1;
      s.lastTime = time;

      if (s.status === "playing") {
        const moveLeft = s.keys.left || (s.pointer.active && s.pointer.x < ROAD_WIDTH / 2);
        const moveRight = s.keys.right || (s.pointer.active && s.pointer.x >= ROAD_WIDTH / 2);
        if (moveLeft && s.playerX > ROAD_MARGIN) s.playerX -= PLAYER_SPEED * dt;
        if (moveRight && s.playerX < ROAD_WIDTH - ROAD_MARGIN - PLAYER_W)
          s.playerX += PLAYER_SPEED * dt;
        s.playerX = Math.max(ROAD_MARGIN, Math.min(ROAD_WIDTH - ROAD_MARGIN - PLAYER_W, s.playerX));

        s.lineOffset = (s.lineOffset + s.speed * dt) % 80;

        s.spawnTimer += dt;
        if (s.spawnTimer > 38) {
          s.spawnTimer = 0;
          spawnEnemy();
        }

        for (const e of s.enemies) {
          e.y += e.speed * dt;
        }
        const before = s.enemies.length;
        s.enemies = s.enemies.filter((e) => {
          if (e.y > GAME_HEIGHT) {
            s.score += 1;
            return false;
          }
          return true;
        });
        if (s.enemies.length !== before) {
          setScore(s.score);
          audioRef.current?.playScore();
          if (s.score > 0 && s.score % 5 === 0) {
            s.speed += 0.6;
            setSpeedLevel(Math.floor(s.score / 5) + 1);
          }
        }

        audioRef.current?.updateEngineSpeed(s.speed);

        const pRect = { x: s.playerX + 4, y: 510, w: PLAYER_W - 8, h: PLAYER_H - 8 };
        for (const e of s.enemies) {
          if (
            pRect.x < e.x + ENEMY_W &&
            pRect.x + pRect.w > e.x &&
            pRect.y < e.y + ENEMY_H &&
            pRect.y + pRect.h > e.y
          ) {
            for (let i = 0; i < 24; i++) {
              s.particles.push({
                x: s.playerX + PLAYER_W / 2,
                y: 510 + PLAYER_H / 2,
                vy: -Math.random() * 4 - 1,
                life: 1,
                color: i % 2 === 0 ? "#ff6b3d" : "#ffcc44",
              });
            }
            endGame();
            break;
          }
        }

        if (Math.random() < 0.6) {
          s.particles.push({
            x: s.playerX + PLAYER_W / 2 + (Math.random() - 0.5) * 10,
            y: 510 + PLAYER_H,
            vy: 1.5 + Math.random(),
            life: 0.5,
            color: "#aaa",
          });
        }
      }

      for (const p of s.particles) {
        p.y += p.vy * dt;
        p.life -= 0.03 * dt;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // ---- draw ----
      ctx.fillStyle = "#0f1a14";
      ctx.fillRect(0, 0, ROAD_WIDTH, GAME_HEIGHT);

      const roadGrad = ctx.createLinearGradient(ROAD_MARGIN, 0, ROAD_WIDTH - ROAD_MARGIN, 0);
      roadGrad.addColorStop(0, "#2a2d34");
      roadGrad.addColorStop(0.5, "#3a3d44");
      roadGrad.addColorStop(1, "#2a2d34");
      ctx.fillStyle = roadGrad;
      ctx.fillRect(ROAD_MARGIN, 0, ROAD_WIDTH - ROAD_MARGIN * 2, GAME_HEIGHT);

      ctx.fillStyle = "#d4d4d4";
      ctx.fillRect(ROAD_MARGIN - 6, 0, 6, GAME_HEIGHT);
      ctx.fillRect(ROAD_WIDTH - ROAD_MARGIN, 0, 6, GAME_HEIGHT);

      ctx.fillStyle = "rgba(255,255,255,0.85)";
      for (let i = 1; i < 4; i++) {
        const lx = ROAD_MARGIN + ((ROAD_WIDTH - ROAD_MARGIN * 2) / 4) * i - 3;
        for (let y = -80 + s.lineOffset; y < GAME_HEIGHT; y += 80) {
          ctx.fillRect(lx, y, 6, 40);
        }
      }

      for (const p of s.particles) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.6;
        ctx.fillRect(p.x, p.y, 4, 4);
      }
      ctx.globalAlpha = 1;

      for (const e of s.enemies) {
        drawCar(ctx, e.x, e.y, ENEMY_W, ENEMY_H, "#e23b3b", "#7a1f1f", false);
      }

      drawCar(ctx, s.playerX, 510, PLAYER_W, PLAYER_H, "#3b7ce2", "#1f3f7a", true);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endGame]);

  // keyboard controls
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.key === "ArrowLeft" || e.key === "a") s.keys.left = true;
      if (e.key === "ArrowRight" || e.key === "d") s.keys.right = true;
      if (e.key === " " || e.key === "Enter") {
        if (s.status === "ready" || s.status === "over") startGame();
        else if (s.status === "playing") pauseGame();
        else if (s.status === "paused") resumeGame();
      }
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        if (s.status === "playing") pauseGame();
        else if (s.status === "paused") resumeGame();
      }
    };
    const up = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.key === "ArrowLeft" || e.key === "a") s.keys.left = false;
      if (e.key === "ArrowRight" || e.key === "d") s.keys.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startGame, pauseGame, resumeGame]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = ROAD_WIDTH / rect.width;
    stateRef.current.pointer.active = true;
    stateRef.current.pointer.x = (e.clientX - rect.left) * scale;
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!stateRef.current.pointer.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = ROAD_WIDTH / rect.width;
    stateRef.current.pointer.x = (e.clientX - rect.left) * scale;
  };
  const handlePointerUp = () => {
    stateRef.current.pointer.active = false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-4 select-none">
      <div className="w-full max-w-md">
        {/* header */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2 text-white">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Rush Hour</h1>
              <p className="text-xs text-slate-400 leading-tight">Dodge the traffic</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span className="text-white font-semibold text-sm">{best}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span className="text-white font-semibold text-sm">{speedLevel}x</span>
            </div>
            <button
              onClick={() => {
                audioRef.current?.init();
                audioRef.current?.resume();
                audioRef.current?.playClick();
                setSettingsOpen(true);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* game frame - scales to fit viewport while keeping 400:600 ratio */}
        <div
          className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/50 ring-1 ring-white/10 mx-auto"
          style={{
            width: "min(100%, calc((100vh - 150px) * 0.667))",
            aspectRatio: `${ROAD_WIDTH} / ${GAME_HEIGHT}`,
          }}
        >
          <canvas
            ref={canvasRef}
            width={ROAD_WIDTH}
            height={GAME_HEIGHT}
            className="block touch-none w-full h-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />

          {/* score overlay */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/40 backdrop-blur-sm border border-white/10">
            <span className="text-white font-bold text-lg tracking-wide">{score}</span>
          </div>

          {/* pause button - only during play */}
          {status === "playing" && (
            <button
              onClick={pauseGame}
              className="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 text-white hover:bg-black/60 transition-colors"
              aria-label="Pause"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}

          {/* start screen */}
          {status === "ready" && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-xl shadow-blue-500/40">
                <Car className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Rush Hour</h2>
                <p className="text-slate-300 text-sm max-w-xs">
                  Tap left or right side of the screen to steer. Avoid the oncoming cars
                  and survive as long as you can.
                </p>
              </div>
              <button
                onClick={startGame}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-transform"
              >
                Start
              </button>
              <p className="text-xs text-slate-400">Or press Space</p>
            </div>
          )}

          {/* pause screen */}
          {status === "paused" && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 border-2 border-blue-400/50 flex items-center justify-center">
                <Pause className="w-7 h-7 text-blue-300" />
              </div>
              <h2 className="text-2xl font-bold text-white">Paused</h2>
              <div className="flex flex-col gap-3 w-full max-w-[200px]">
                <button
                  onClick={resumeGame}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-transform"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
                <button
                  onClick={() => {
                    resetGame();
                    stateRef.current.status = "ready";
                    setStatus("ready");
                  }}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restart
                </button>
              </div>
            </div>
          )}

          {/* game over screen */}
          {status === "over" && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-5 px-8 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center">
                <span className="text-3xl text-red-400 font-bold">!</span>
              </div>
              <div>
                <h2 className="text-3xl font-extrabold text-white mb-1">Game Over</h2>
                <p className="text-slate-300 text-sm">
                  Score <span className="text-cyan-400 font-bold">{score}</span>
                  {score >= best && score > 0 && (
                    <span className="text-yellow-400 font-bold"> · New best!</span>
                  )}
                </p>
              </div>
              <button
                onClick={startGame}
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-transform"
              >
                <RotateCcw className="w-5 h-5" />
                Play Again
              </button>
            </div>
          )}
        </div>

        {/* controls hint */}
        <p className="text-center text-slate-500 text-xs mt-3">
          Tap or hold the left / right side to steer · Arrow keys also work
        </p>

        {/* install button */}
        {installEvent && !installed && (
          <button
            onClick={handleInstall}
            className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
          >
            <Download className="w-5 h-5" />
            Install App
          </button>
        )}
        {installed && (
          <div className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-semibold">
            <Check className="w-5 h-5" />
            App installed
          </div>
        )}

        <p className="mt-6 text-center text-xs tracking-wide text-slate-500">
          © 2026 Car Game // hiro arab game
        </p>
      </div>

      {/* settings modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-slate-800 rounded-2xl shadow-2xl ring-1 ring-white/10 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                Settings
              </h2>
              <button
                onClick={() => {
                  audioRef.current?.playClick();
                  setSettingsOpen(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* music toggle */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <Music className="w-4 h-4 text-cyan-400" />
                  Music
                </label>
                <button
                  onClick={() => {
                    audioRef.current?.playClick();
                    setMusicOn((v) => !v);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    musicOn ? "bg-blue-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      musicOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {musicOn ? (
                  <Volume1 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500 flex-shrink-0" />
                )}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVol}
                  disabled={!musicOn}
                  onChange={(e) => setMusicVol(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 disabled:opacity-40"
                />
                <span className="text-xs text-slate-400 w-8 text-right tabular-nums">
                  {Math.round(musicVol * 100)}
                </span>
              </div>
            </div>

            {/* sfx toggle */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-200 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-cyan-400" />
                  Sound Effects
                </label>
                <button
                  onClick={() => {
                    audioRef.current?.playClick();
                    setSfxOn((v) => !v);
                  }}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    sfxOn ? "bg-blue-500" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      sfxOn ? "translate-x-6" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {sfxOn ? (
                  <Volume1 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500 flex-shrink-0" />
                )}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sfxVol}
                  disabled={!sfxOn}
                  onChange={(e) => setSfxVol(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 disabled:opacity-40"
                />
                <span className="text-xs text-slate-400 w-8 text-right tabular-nums">
                  {Math.round(sfxVol * 100)}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                audioRef.current?.playClick();
                setSettingsOpen(false);
              }}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-bold shadow-lg shadow-blue-500/30 hover:scale-[1.02] active:scale-95 transition-transform"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
