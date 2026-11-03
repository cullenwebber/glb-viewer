import { Play, Pause, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import type { ViewerController } from "@/hooks/use-model-viewer";
export function PlaybackBar({ viewer }: { viewer: ViewerController }) {
  const { state } = viewer;
  return (
    <div className="playback-bar">
      <Button
        id="play"
        variant="ghost"
        size="icon-sm"
        disabled={!state.clips.length}
        onClick={viewer.play}
        aria-label={state.playing ? "Pause animation" : "Play animation"}
      >
        {state.playing ? <Pause /> : <Play />}
      </Button>
      <NativeSelect
        id="animation"
        aria-label="Animation"
        value={state.clipIndex}
        onChange={(event) => viewer.selectAnimation(Number(event.target.value))}
        className="max-w-40 border-none bg-transparent text-xs"
        disabled={!state.clips.length}
      >
        {state.clips.length ? (
          state.clips.map((clip, index) => (
            <NativeSelectOption key={index} value={index}>
              {clip.name}
            </NativeSelectOption>
          ))
        ) : (
          <NativeSelectOption value={0}>No animations</NativeSelectOption>
        )}
      </NativeSelect>
      <Slider
        id="scrub"
        aria-label="Animation position"
        min={0}
        max={state.duration || 1}
        step={0.01}
        value={[state.time]}
        disabled={!state.clips.length}
        onValueChange={(value) => viewer.seek(value[0])}
        className="min-w-10 flex-1"
      />
      <span
        id="time"
        className="whitespace-nowrap font-mono text-[9px] text-muted-foreground"
      >
        {state.time.toFixed(2)} / {state.duration.toFixed(2)} s
      </span>
      <NativeSelect
        id="speed"
        aria-label="Playback speed"
        value={viewer.speed}
        onChange={(event) => viewer.setSpeed(Number(event.target.value))}
        className="w-18 border-none bg-transparent text-xs"
      >
        {[0.5, 1, 2].map((speed) => (
          <NativeSelectOption key={speed} value={speed}>
            {speed}×
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground xl:flex">
        <Repeat className="size-3" />
        Loop
      </span>
    </div>
  );
}
