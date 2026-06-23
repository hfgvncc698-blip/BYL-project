#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

static AVSpeechSynthesisVoice *FindVoice(NSString *requestedName) {
  NSString *lowerRequested = [requestedName lowercaseString];
  AVSpeechSynthesisVoice *firstFrenchVoice = nil;
  for (AVSpeechSynthesisVoice *voice in [AVSpeechSynthesisVoice speechVoices]) {
    if (!firstFrenchVoice && [voice.language hasPrefix:@"fr"]) {
      firstFrenchVoice = voice;
    }
    NSString *voiceName = [[voice name] lowercaseString];
    NSString *identifier = [[voice identifier] lowercaseString];
    if ([voiceName containsString:lowerRequested] || [identifier containsString:lowerRequested]) {
      return voice;
    }
  }
  return firstFrenchVoice ?: [AVSpeechSynthesisVoice voiceWithLanguage:@"fr-FR"];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 5) {
      fprintf(stderr, "Usage: synthesize-voice <voice-name> <rate> <output.caf> <text>\n");
      return 64;
    }

    NSString *voiceName = [NSString stringWithUTF8String:argv[1]];
    float wordsPerMinute = (float)atof(argv[2]);
    NSString *outputPath = [NSString stringWithUTF8String:argv[3]];
    NSString *text = [NSString stringWithUTF8String:argv[4]];

    AVSpeechUtterance *utterance = [[AVSpeechUtterance alloc] initWithString:text];
    utterance.voice = FindVoice(voiceName);
    utterance.rate = MIN(0.58, MAX(0.42, wordsPerMinute / 340.0));
    utterance.pitchMultiplier = 1.0;
    utterance.volume = 1.0;

    AVSpeechSynthesizer *synthesizer = [AVSpeechSynthesizer new];
    NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
    __block AVAudioFile *audioFile = nil;
    __block BOOL done = NO;
    __block BOOL failed = NO;

    [synthesizer writeUtterance:utterance toBufferCallback:^(AVAudioBuffer *buffer) {
      AVAudioPCMBuffer *pcmBuffer = (AVAudioPCMBuffer *)buffer;
      if (![pcmBuffer isKindOfClass:[AVAudioPCMBuffer class]] || pcmBuffer.frameLength == 0) {
        done = YES;
        return;
      }

      if (!audioFile) {
        NSError *fileError = nil;
        audioFile = [[AVAudioFile alloc] initForWriting:outputURL settings:pcmBuffer.format.settings error:&fileError];
        if (fileError || !audioFile) {
          failed = YES;
          done = YES;
          return;
        }
      }

      NSError *writeError = nil;
      [audioFile writeFromBuffer:pcmBuffer error:&writeError];
      if (writeError) {
        failed = YES;
        done = YES;
      }
    }];

    NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:120];
    while (!done && [deadline timeIntervalSinceNow] > 0) {
      [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
    }

    if (!done || failed) {
      fprintf(stderr, "Speech synthesis failed\n");
      return 70;
    }
  }
  return 0;
}
