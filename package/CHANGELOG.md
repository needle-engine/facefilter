# Changelog
All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [1.0.5] - 2026-10-06
- Fix Facefilter builds with Needle Engine 5.1 and 6 alpha projects using Vite 8.
- Allow custom recording logos and download names in all Facefilter projects.
- Allow Facefilter to use the same Three.js version as the project.

## [1.0.4] - 2025-10-29
- Add: Expose base `FaceFilterBehaviour` for implementing custom filter behaviours.
- Add: The `FaceFilterRoot` class that is automatically added to every filter instance now exposed access to the filter manager and face index. This provides an alternative way to access face data for components that don't derive from FaceFilterBehaviour.

## [1.0.3] - 2025-10-03
- Fix: Retry camera access if it fails the first time (some browsers need a moment to enable camera access)
- Unity: `ShowVideo` option is now exposed to Unity Editor as a toggle to show/hide the video feed

## [1.0.0] - 2025-08-15
- Release

## [1.0.0-beta.10] - 2025-04-09
- Add new attributes: `face-filter-show-video` to show/hide the videofeed and `face-filter-video-selector` to provide a custom video element

## [1.0.0-beta.7] - 2025-03-25
- Add: `FaceFilterRoot.create("url")`
- Add: Precompiled version
- Add: HTML example without a bundler
- Add: Allow assigning facefilter to `<needle-engine>` via `<needle-engine face-filter="image_or_3dmodel_url">`

## [1.0.0-alpha.15] - 2025-03-21
- Add: NeedleFaceFilterTrackingManager `addFilter`, `removeFilter`, `activateFilter`, `deactivateFilter` 

## [1.0.0-alpha] - 2025-03-20
- Initial release
