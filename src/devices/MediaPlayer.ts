import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class MediaPlayer extends GenericDevice {
    protected _getStateState: DeviceStateObject<boolean|number> | undefined;
    protected _setPlayState: DeviceStateObject<boolean> | undefined;
    protected _setPauseState: DeviceStateObject<boolean> | undefined;
    protected _setStopState: DeviceStateObject<boolean> | undefined;
    protected _setNextState: DeviceStateObject<boolean> | undefined;
    protected _setPrevState: DeviceStateObject<boolean> | undefined;
    protected _shuffleState: DeviceStateObject<boolean> | undefined;
    protected _repeatState: DeviceStateObject<number> | undefined;
    protected _getArtistState: DeviceStateObject<string> | undefined;
    protected _getAlbumState: DeviceStateObject<string> | undefined;
    protected _getTitleState: DeviceStateObject<string> | undefined;
    protected _getCoverState: DeviceStateObject<string> | undefined;
    protected _getDurationState: DeviceStateObject<number> | undefined;
    protected _getElapsedState: DeviceStateObject<number> | undefined;
    protected _setSeekState: DeviceStateObject<number> | undefined;
    protected _getTrackState: DeviceStateObject<string> | undefined;
    protected _getEpisodeState: DeviceStateObject<string> | undefined;
    protected _getSeasonState: DeviceStateObject<string> | undefined;
    protected _setVolumeState: DeviceStateObject<number> | undefined;
    protected _getVolumeState: DeviceStateObject<number> | undefined;
    protected _muteState: DeviceStateObject<boolean> | undefined;
    protected _getConnectedState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'STATE', type: PropertyType.State, callback: state => this._getStateState = state},
            {name: 'PLAY', type: PropertyType.Play, callback: state => this._setPlayState = state},
            {name: 'PAUSE', type: PropertyType.Pause, callback: state => this._setPauseState = state},
            {name: 'STOP', type: PropertyType.Stop, callback: state => this._setStopState = state},
            {name: 'NEXT', type: PropertyType.Next, callback: state => this._setNextState = state},
            {name: 'PREV', type: PropertyType.Prev, callback: state => this._setPrevState = state},
            {name: 'SHUFFLE', type: PropertyType.Shuffle, callback: state => this._shuffleState = state},
            {name: 'REPEAT', type: PropertyType.Repeat, callback: state => this._repeatState = state},
            {name: 'ARTIST', type: PropertyType.Artist, callback: state => this._getArtistState = state},
            {name: 'ALBUM', type: PropertyType.Album, callback: state => this._getAlbumState = state},
            {name: 'TITLE', type: PropertyType.Title, callback: state => this._getTitleState = state},
            {name: 'COVER', type: PropertyType.Cover, callback: state => this._getCoverState = state},
            {name: 'DURATION', type: PropertyType.Duration, callback: state => this._getDurationState = state},
            {name: 'ELAPSED', type: PropertyType.Elapsed, callback: state => this._getElapsedState = state},
            {name: 'SEEK', type: PropertyType.Seek, callback: state => this._setSeekState = state},
            {name: 'TRACK', type: PropertyType.Track, callback: state => this._getTrackState = state},
            {name: 'EPISODE', type: PropertyType.Episode, callback: state => this._getEpisodeState = state},
            {name: 'SEASON', type: PropertyType.Season, callback: state => this._getSeasonState = state},
            {name: 'VOLUME', type: PropertyType.Volume, callback: state => this._setVolumeState = state},
            {name: 'VOLUME_ACTUAL', type: PropertyType.VolumeActual, callback: state => this._getVolumeState = state || this._setVolumeState},
            {name: 'MUTE', type: PropertyType.Mute, callback: state => this._muteState = state},
            {name: 'CONNECTED', type: PropertyType.Connected, callback: state => this._getConnectedState = state},
        ]);
    }

    getState(): boolean|number | undefined{ 
        if (!this._getStateState) {
            throw new Error('State state not found');
        }
        return this._getStateState.value;
    }

    async play() {
        if (!this._setPlayState) {
            throw new Error('Play state not found');
        }
        return this._setPlayState.setValue(true);
    }

    async pause() {
        if (!this._setPauseState) {
            throw new Error('Pause state not found');
        }
        return this._setPauseState.setValue(true);
    }

    async stop() {
        if (!this._setStopState) {
            throw new Error('Stop state not found');
        }
        return this._setStopState.setValue(true);
    }

    async next() {
        if (!this._setNextState) {
            throw new Error('Next state not found');
        }
        return this._setNextState.setValue(true);
    }

    async prev() {
        if (!this._setPrevState) {
            throw new Error('Prev state not found');
        }
        return this._setPrevState.setValue(true);
    }

    getShuffle(): boolean | undefined{ 
        if (!this._shuffleState) {
            throw new Error('Shuffle state not found');
        }
        return this._shuffleState.value;
    }

    async setShuffle(value: boolean) {
        if (!this._shuffleState) {
            throw new Error('Shuffle state not found');
        }
        return this._shuffleState.setValue(value);
    }

    getRepeat(): number | undefined{ 
        if (!this._repeatState) {
            throw new Error('Repeat state not found');
        }
        return this._repeatState.value;
    }

    async setRepeat(value: number) {
        if (!this._repeatState) {
            throw new Error('Repeat state not found');
        }
        return this._repeatState.setValue(value);
    }

    getArtist(): string | undefined{ 
        if (!this._getArtistState) {
            throw new Error('Artist state not found');
        }
        return this._getArtistState.value;
    }

    getAlbum(): string | undefined{ 
        if (!this._getAlbumState) {
            throw new Error('Album state not found');
        }
        return this._getAlbumState.value;
    }

    getTitle(): string | undefined{ 
        if (!this._getTitleState) {
            throw new Error('Title state not found');
        }
        return this._getTitleState.value;
    }

    getCover(): string | undefined{ 
        if (!this._getCoverState) {
            throw new Error('Cover state not found');
        }
        return this._getCoverState.value;
    }

    getDuration(): number | undefined{ 
        if (!this._getDurationState) {
            throw new Error('Duration state not found');
        }
        return this._getDurationState.value;
    }

    getElapsed(): number | undefined{ 
        if (!this._getElapsedState) {
            throw new Error('Elapsed state not found');
        }
        return this._getElapsedState.value;
    }

    async seek(value: number) {
        if (!this._setSeekState) {
            throw new Error('Seek state not found');
        }
        return this._setSeekState.setValue(value);
    }

    getTrack(): string | undefined{ 
        if (!this._getTrackState) {
            throw new Error('Track state not found');
        }
        return this._getTrackState.value;
    }

    getEpisode(): string | undefined{ 
        if (!this._getEpisodeState) {
            throw new Error('Episode state not found');
        }
        return this._getEpisodeState.value;
    }

    getSeason(): string | undefined{ 
        if (!this._getSeasonState) {
            throw new Error('Season state not found');
        }
        return this._getSeasonState.value;
    }

    getVolume(): number | undefined{ 
        if (!this._getVolumeState) {
            throw new Error('Volume state not found');
        }
        return this._getVolumeState.value;
    }

    async setVolume(value: number) {
        if (!this._setVolumeState) {
            throw new Error('Volume state not found');
        }
        return this._setVolumeState.setValue(value);
    }

    getMute(): boolean | undefined{ 
        if (!this._muteState) {
            throw new Error('Mute state not found');
        }
        return this._muteState.value;
    }

    async setMute(value: boolean) {
        if (!this._muteState) {
            throw new Error('Mute state not found');
        }
        return this._muteState.setValue(value);
    }

    getConnected(): boolean | undefined{ 
        if (!this._getConnectedState) {
            throw new Error('Connected state not found');
        }
        return this._getConnectedState.value;
    }
}

export default MediaPlayer;