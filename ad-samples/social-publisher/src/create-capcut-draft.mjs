import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const ROOT = resolve(".");
const DRAFT_ROOT = resolve(homedir(), "Movies/CapCut/User Data/Projects/com.lveditor.draft");
const TEMPLATE_DRAFT = resolve(DRAFT_ROOT, "0331");
const DATE = process.env.BYL_CAPCUT_DATE || "2026-05-31";
const DRAFT_NAME = `BYL Daily ${DATE}`;
const OUT_DIR = resolve(DRAFT_ROOT, `BYL Daily ${DATE}`);
const FINAL_VIDEO_PATHS = [
  "public/social-media/daily/2026-05-31/sunday-09h00-tiktok-tiktok-le-passage-d-excel-a-une-vraie-experience-client-08cdab05-r1.mp4",
  "public/social-media/daily/2026-05-31/sunday-13h00-tiktok-tiktok-la-gerante-qui-ouvre-son-studio-fd7bd9b8-r1.mp4",
  "public/social-media/daily/2026-05-31/sunday-20h30-story-instagram-story-le-client-qui-a-besoin-d-une-reponse-claire-9ec58670-r1.mp4",
].map((path) => resolve(ROOT, path));

function uuid() {
  return randomUUID().toUpperCase();
}

function ffprobe(path) {
  const output = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    path,
  ]);
  const data = JSON.parse(output);
  return {
    width: data.streams?.[0]?.width || 1080,
    height: data.streams?.[0]?.height || 1920,
    durationUs: Math.round(Number(data.format?.duration || 0) * 1_000_000),
  };
}

function makeExtraRefs() {
  return {
    speedId: uuid(),
    placeholderId: uuid(),
    canvasId: uuid(),
    animationId: uuid(),
    soundMappingId: uuid(),
    materialColorId: uuid(),
    loudnessId: uuid(),
    vocalSeparationId: uuid(),
  };
}

function makeSegment({ materialId, refs, durationUs, startUs, index }) {
  return {
    id: uuid(),
    source_timerange: { start: 0, duration: durationUs },
    target_timerange: { start: startUs, duration: durationUs },
    render_timerange: { start: 0, duration: 0 },
    desc: "",
    state: 0,
    speed: 1.0,
    is_loop: false,
    is_tone_modify: false,
    reverse: false,
    intensifies_audio: false,
    cartoon: false,
    volume: 1.0,
    last_nonzero_volume: 1.0,
    clip: {
      scale: { x: 1.0, y: 1.0 },
      rotation: 0.0,
      transform: { x: 0.0, y: 0.0 },
      flip: { vertical: false, horizontal: false },
      alpha: 1.0,
    },
    uniform_scale: { on: true, value: 1.0 },
    material_id: materialId,
    extra_material_refs: Object.values(refs),
    render_index: index,
    keyframe_refs: [],
    enable_lut: true,
    enable_adjust: true,
    enable_hsl: false,
    visible: true,
    group_id: "",
    enable_color_curves: true,
    enable_hsl_curves: true,
    track_render_index: 0,
    hdr_settings: { mode: 1, intensity: 1.0, nits: 1000 },
    enable_color_wheels: true,
    track_attribute: 0,
    is_placeholder: false,
    template_id: "",
    enable_smart_color_adjust: false,
    template_scene: "default",
    common_keyframes: [],
    caption_info: null,
    responsive_layout: { enable: false, target_follow: "", size_layout: 0, horizontal_pos_layout: 0, vertical_pos_layout: 0 },
    enable_color_match_adjust: false,
    enable_color_correct_adjust: false,
    enable_adjust_mask: false,
    raw_segment_id: "",
    lyric_keyframes: null,
    enable_video_mask: true,
    digital_human_template_group_id: "",
    color_correct_alg_result: "",
    source: "segmentsourcenormal",
    enable_mask_stroke: false,
    enable_mask_shadow: false,
    enable_color_adjust_pro: false,
  };
}

function emptyMaterials() {
  return {
    flowers: [],
    videos: [],
    tail_leaders: [],
    audios: [],
    images: [],
    texts: [],
    effects: [],
    stickers: [],
    canvases: [],
    transitions: [],
    audio_effects: [],
    audio_fades: [],
    beats: [],
    material_animations: [],
    placeholders: [],
    placeholder_infos: [],
    speeds: [],
    common_mask: [],
    chromas: [],
    text_templates: [],
    realtime_denoises: [],
    audio_pannings: [],
    audio_pitch_shifts: [],
    video_trackings: [],
    hsl: [],
    drafts: [],
    color_curves: [],
    hsl_curves: [],
    primary_color_wheels: [],
    log_color_wheels: [],
    video_effects: [],
    audio_balances: [],
    handwrites: [],
    manual_deformations: [],
    manual_beautys: [],
    plugin_effects: [],
    sound_channel_mappings: [],
    green_screens: [],
    shapes: [],
    material_colors: [],
    digital_humans: [],
    digital_human_model_dressing: [],
    smart_crops: [],
    ai_translates: [],
    audio_track_indexes: [],
    loudnesses: [],
    vocal_beautifys: [],
    vocal_separations: [],
    smart_relights: [],
    time_marks: [],
    multi_language_refs: [],
    video_shadows: [],
    video_strokes: [],
    video_radius: [],
  };
}

async function main() {
  if (!existsSync(TEMPLATE_DRAFT)) {
    throw new Error(`CapCut template draft not found: ${TEMPLATE_DRAFT}`);
  }

  const now = Date.now() * 1000;
  const timelineId = uuid();
  const trackId = uuid();
  const materials = emptyMaterials();
  const segments = [];
  const draftMaterials = [];
  let cursorUs = 0;

  for (let index = 0; index < FINAL_VIDEO_PATHS.length; index += 1) {
    const path = FINAL_VIDEO_PATHS[index];
    const info = ffprobe(path);
    const materialId = uuid();
    const refs = makeExtraRefs();
    materials.videos.push({
      id: materialId,
      unique_id: "",
      type: "video",
      duration: info.durationUs,
      path,
      media_path: "",
      local_id: "",
      has_audio: true,
      reverse_path: "",
      intensifies_path: "",
      reverse_intensifies_path: "",
      intensifies_audio_path: "",
      cartoon_path: "",
      width: info.width,
      height: info.height,
      category_id: "",
      category_name: "local",
      material_id: "",
      material_name: basename(path),
      material_url: "",
      crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
      crop_ratio: "free",
      audio_fade: null,
      crop_scale: 1.0,
      extra_type_option: 0,
      stable: { stable_level: 0, matrix_path: "", time_range: { start: 0, duration: 0 } },
      source: 0,
      source_platform: 0,
      formula_id: "",
      check_flag: 62978047,
      is_copyright: true,
      roughcut_time_range: { start: 0, duration: info.durationUs },
      sub_time_range: { start: -1, duration: -1 },
    });
    materials.speeds.push({ id: refs.speedId, type: "speed", mode: 0, speed: 1.0, curve_speed: null });
    materials.placeholder_infos.push({ id: refs.placeholderId, type: "placeholder_info", meta_type: "none", res_path: "", res_text: "", error_path: "", error_text: "" });
    materials.canvases.push({ id: refs.canvasId, type: "canvas_color", color: "", blur: 0, image: "", album_image: "", image_id: "", image_name: "", source_platform: 0, team_id: "" });
    materials.material_animations.push({ id: refs.animationId, type: "sticker_animation", animations: [], multi_language_current: "none" });
    materials.sound_channel_mappings.push({ id: refs.soundMappingId, type: "none", audio_channel_mapping: 0, is_config_open: false });
    materials.material_colors.push({ id: refs.materialColorId, is_color_clip: false, is_gradient: false, solid_color: "", gradient_colors: [], gradient_percents: [], gradient_angle: 90, width: 0, height: 0 });
    materials.loudnesses.push({ id: refs.loudnessId, enable: true, time_range: null, file_id: "", target_loudness: -15, loudness_param: null });
    materials.vocal_separations.push({ id: refs.vocalSeparationId, type: "vocal_separation", choice: 0, removed_sounds: [], time_range: null, production_path: "", final_algorithm: "", enter_from: "" });
    segments.push(makeSegment({ materialId, refs, durationUs: info.durationUs, startUs: cursorUs, index }));
    draftMaterials.push({
      ai_group_type: "",
      create_time: now,
      duration: info.durationUs,
      enter_from: 0,
      extra_info: basename(path),
      file_Path: path,
      height: info.height,
      id: materialId.toLowerCase(),
      import_time: now,
      import_time_ms: now,
      item_source: 1,
      md5: "",
      metetype: "video",
      roughcut_time_range: { duration: info.durationUs, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 0,
      width: info.width,
    });
    cursorUs += info.durationUs;
  }

  const draftInfo = {
    id: timelineId,
    version: 360000,
    new_version: "163.0.0",
    name: DRAFT_NAME,
    duration: cursorUs,
    create_time: now,
    update_time: now,
    fps: 30.0,
    is_drop_frame_timecode: false,
    color_space: 0,
    config: {
      video_mute: false,
      record_audio_last_index: 1,
      extract_audio_last_index: 1,
      original_sound_last_index: 1,
      subtitle_recognition_id: "",
      subtitle_taskinfo: [],
      lyrics_recognition_id: "",
      lyrics_taskinfo: [],
      subtitle_sync: true,
      lyrics_sync: true,
      sticker_max_index: 1,
      adjust_max_index: 1,
      material_save_mode: 0,
      export_range: null,
      maintrack_adsorb: true,
      combination_max_index: 1,
      attachment_info: [],
      zoom_info_params: null,
      system_font_list: [],
      multi_language_mode: "none",
      multi_language_main: "none",
      multi_language_current: "none",
      multi_language_list: [],
      subtitle_keywords_config: null,
      use_float_render: false,
    },
    canvas_config: { ratio: "original", width: 1080, height: 1920, background: null },
    tracks: [{ id: trackId, type: "video", segments, flag: 0, attribute: 0, name: "", is_default_name: true }],
    group_container: null,
    materials,
    keyframes: { videos: [], audios: [], texts: [], stickers: [], filters: [], adjusts: [], handwrites: [], effects: [] },
    keyframe_graph_list: [],
    relationships: [],
    render_index_track_mode_on: true,
    free_render_index_mode_on: false,
    static_cover_image_path: "",
    source: "default",
    draft_type: "video",
  };

  const project = {
    config: { color_space: 0, render_index_track_mode_on: true, use_float_render: false },
    create_time: now,
    id: timelineId,
    main_timeline_id: timelineId,
    timelines: [{ create_time: now, id: timelineId, is_marked_delete: false, name: "Chronologie 01", update_time: now }],
    update_time: now,
    version: 0,
  };

  const meta = {
    draft_cloud_capcut_purchase_info: "",
    draft_cloud_last_action_download: false,
    draft_cover: "draft_cover.jpg",
    draft_deeplink_url: "",
    draft_fold_path: OUT_DIR,
    draft_id: uuid(),
    draft_is_invisible: false,
    draft_materials: [{ type: 0, value: draftMaterials }, { type: 1, value: [] }, { type: 2, value: [] }, { type: 3, value: [] }, { type: 6, value: [] }, { type: 7, value: [] }],
    draft_name: DRAFT_NAME,
    draft_need_rename_folder: false,
    draft_new_version: "",
    draft_root_path: DRAFT_ROOT,
    draft_timeline_materials_size_: draftMaterials.length,
    draft_type: "video",
    tm_draft_create: now,
    tm_draft_modified: now,
    tm_draft_removed: 0,
    tm_duration: cursorUs,
  };

  await mkdir(resolve(OUT_DIR, "Timelines", timelineId, "common_attachment"), { recursive: true });
  await mkdir(resolve(OUT_DIR, "common_attachment"), { recursive: true });
  await writeFile(resolve(OUT_DIR, "draft_info.json"), JSON.stringify(draftInfo));
  await writeFile(resolve(OUT_DIR, "draft_meta_info.json"), JSON.stringify(meta));
  await writeFile(resolve(OUT_DIR, "draft_virtual_store.json"), "{}");
  await writeFile(resolve(OUT_DIR, "performance_opt_info.json"), "{}");
  await writeFile(resolve(OUT_DIR, "attachment_pc_common.json"), "{}");
  await writeFile(resolve(OUT_DIR, "common_attachment/attachment_pc_timeline.json"), "{}");
  await writeFile(resolve(OUT_DIR, "Timelines/project.json"), JSON.stringify(project));
  await writeFile(resolve(OUT_DIR, `Timelines/${timelineId}/draft_info.json`), JSON.stringify(draftInfo));
  await writeFile(resolve(OUT_DIR, `Timelines/${timelineId}/attachment_pc_common.json`), "{}");
  await writeFile(resolve(OUT_DIR, `Timelines/${timelineId}/common_attachment/attachment_pc_timeline.json`), "{}");
  if (existsSync(resolve(TEMPLATE_DRAFT, "draft_cover.jpg"))) {
    await copyFile(resolve(TEMPLATE_DRAFT, "draft_cover.jpg"), resolve(OUT_DIR, "draft_cover.jpg"));
  }
  console.log(OUT_DIR);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
