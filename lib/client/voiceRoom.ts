import { ParticipantKind, Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from "livekit-client";

// The person's side of a live conversation with the voice assistant (adapted from the R&D Loop presenter client,
// which is Safari-tested): publishes the microphone, plays her voice, renders the Tavus avatar video, streams captions
// from `lk.transcription`, and sends typed answers to the agent as `lk.chat` text.

export interface TranscriptSegment {
  id: string;
  who: "linh" | "you";
  text: string;
  final: boolean;
}

/** Mobile app: she saved something into the plan (so the screen shows it), or she's moving the app to a screen. */
export interface PlanEvent {
  type: "answer" | "clip" | "goto";
  questionId?: string;
  screen?: string;
}

export interface VoiceCallbacks {
  onTranscript: (seg: TranscriptSegment) => void;
  onAgentState: (state: string) => void;
  onVideoTrack: (track: RemoteTrack | null) => void;
  onDisconnect: () => void;
  onAgentLeft?: () => void;
  onPlanEvent?: (event: PlanEvent) => void;
  /** Her voice, for the live waveform. */
  onAgentAudio?: (track: MediaStreamTrack | null) => void;
}

export class VoiceRoom {
  // stopMicTrackOnMute releases the microphone while she is muted, so the on-screen recorder can use it (iOS Safari).
  // No automatic gain control: in Chrome it turns down the Mac's system microphone volume during the call, which also
  // silences the person in any screen recording (Screen Studio, QuickTime). Echo cancellation and noise suppression stay on.
  room = new Room({ adaptiveStream: true, dynacast: true, publishDefaults: { stopMicTrackOnMute: true }, audioCaptureDefaults: { autoGainControl: false } });
  private audioEls: HTMLMediaElement[] = [];
  private cb: VoiceCallbacks | null = null;

  /** `mic: false` joins without the microphone (the mobile app waits for the Play tap before listening). */
  async connect(url: string, token: string, cb: VoiceCallbacks, opts: { mic?: boolean } = {}): Promise<void> {
    this.cb = cb;
    this.room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => this.handleTrack(track, participant));
    this.room.on(RoomEvent.TrackUnsubscribed, (track) => {
      if (track.kind === Track.Kind.Video) cb.onVideoTrack(null);
      if (track.kind === Track.Kind.Audio) cb.onAgentAudio?.(null);
      track.detach().forEach((el) => el.remove());
    });
    this.room.on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => this.readAgentState(participant as RemoteParticipant));
    this.room.on(RoomEvent.Disconnected, () => cb.onDisconnect());
    this.room.on(RoomEvent.ParticipantDisconnected, (p) => {
      if (p.kind === ParticipantKind.AGENT && !p.attributes["lk.publish_on_behalf"]) cb.onAgentLeft?.();
    });
    this.room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
      const attrs = reader.info.attributes || {};
      const id = attrs["lk.segment_id"] || reader.info.id;
      const final = attrs["lk.transcription_final"] === "true";
      const who: TranscriptSegment["who"] = participantInfo.identity === this.room.localParticipant.identity ? "you" : "linh";
      let text = "";
      for await (const chunk of reader) {
        text += chunk;
        cb.onTranscript({ id, who, text, final: false });
      }
      cb.onTranscript({ id, who, text, final });
    });
    this.room.registerTextStreamHandler("heard.plan", async (reader) => {
      const text = await reader.readAll();
      try {
        cb.onPlanEvent?.(JSON.parse(text) as PlanEvent);
      } catch {
        /* not an event we know */
      }
    });
    await this.room.connect(url, token);
    try {
      await this.room.startAudio();
    } catch {
      /* browsers that need a gesture resume on the next click */
    }
    if (opts.mic !== false) await this.room.localParticipant.setMicrophoneEnabled(true);
    for (const p of this.room.remoteParticipants.values()) this.readAgentState(p);
  }

  /** Call from a tap: lets the browser play her voice. */
  startAudio(): Promise<void> {
    return this.room.startAudio();
  }

  /** The microphone track while it's on, for the live waveform. */
  micTrack(): MediaStreamTrack | null {
    return this.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack ?? null;
  }

  private handleTrack(track: RemoteTrack, participant: RemoteParticipant) {
    if (track.kind === Track.Kind.Audio) {
      const el = track.attach();
      el.autoplay = true;
      document.body.appendChild(el);
      this.audioEls.push(el);
      this.cb?.onAgentAudio?.(track.mediaStreamTrack);
    } else if (track.kind === Track.Kind.Video) {
      this.cb?.onVideoTrack(track);
    }
    this.readAgentState(participant);
  }

  private readAgentState(participant: RemoteParticipant) {
    if (participant.kind !== ParticipantKind.AGENT) return;
    if (participant.attributes["lk.publish_on_behalf"]) return; // the avatar worker, not the agent
    const state = participant.attributes["lk.agent.state"];
    if (state) this.cb?.onAgentState(state);
  }

  async setMicEnabled(on: boolean): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(on);
  }

  get micEnabled(): boolean {
    return this.room.localParticipant.isMicrophoneEnabled;
  }

  async sendText(text: string): Promise<void> {
    await this.room.localParticipant.sendText(text, { topic: "lk.chat" });
  }

  async disconnect(): Promise<void> {
    for (const el of this.audioEls) el.remove();
    this.audioEls = [];
    await this.room.disconnect();
  }
}
