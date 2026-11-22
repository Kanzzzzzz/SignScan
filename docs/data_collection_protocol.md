# Data collection protocol

Follows the Data Privacy Act of 2012 (RA 10173). Only hand-landmark coordinates are stored.
No photos, no video, no names.

## Before recording

1. **Consent.** Each participant reads and signs the consent form below. For minors, a parent or guardian also signs.
2. **Signer code.** Give each participant an anonymous code (`S01`, `S02`, … for training, `T01`, … for test signers).
   Keep the code ↔ name list on paper, stored separately, and never in the repository.
3. **Validation.** An FSL signer or SPED/FSL teacher checks each participant's hand shapes before recording (G1).

## Setup

- Laptop webcam or USB webcam at chest height, about 40–80 cm from the hand.
- Open SignScan → **Collect**. Allow camera access.
- Enter the signer code and session (`s1`, `s2`, …). Set the condition dropdowns to match the room.

## Per-signer script (about 20–30 minutes)

For each condition you're recording (at least *normal light, plain background, near*):

1. Pick a letter from the grid.
2. Press **Record**. During the 3 s countdown, form the hand shape.
3. Over 5 s, hold the shape and **vary it slightly**: tilt a little, move a bit closer and farther, shift left and right.
   Only frames with a confident hand detection are kept (10 per second).
4. Repeat until the letter shows ✓ (≈ 4 bursts, ≈ 200 samples).
5. Check the burst list. **Delete** any burst where the wrong shape was made, or the hand left the frame.
6. Move to the next letter. Take breaks.

## After recording

- **On the training computer (running `npm run dev`):** press **Train model** on the Collect page,
  or keep **Auto-train** on. The model updates by itself.
- **Recorded on another computer:** **Export this signer (JSONL)**, copy the file into `data/raw/`
  on the training computer, then press **Train model** there, or run `python ml/scripts/pipeline.py`.
- Clear the browser's copy if the laptop is shared (**Delete all**). Export first.

## Consent form (template)

> **SignScan: research participation consent**
>
> I agree to take part in data collection for SignScan, a student research project that recognizes
> sign-language alphabet hand shapes from a camera.
>
> - The camera records only the positions of 21 points on my hand. No photo or video of me is saved.
> - My data is labelled with a code, not my name.
> - The data will be used only to train and test SignScan, and stored by the research team.
> - I can stop at any time, and ask for my data to be deleted, without giving a reason.
>
> Name: ____________________  Signature: ____________  Date: ________
> Parent/guardian (if under 18): ____________________  Signature: ____________
> Signer code (filled in by the team): ________
