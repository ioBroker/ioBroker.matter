import React, { Component } from 'react';
import { Box, Button, IconButton, TextField, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { I18n } from '@iobroker/adapter-react-v5';

import type { MatterControllerConfig, ThreadCredentialEntry, WifiCredentialEntry } from '../types';

const RESERVED_IDS = ['default', 'delete'];

const styles: Record<string, React.CSSProperties> = {
    header: { fontWeight: 'bold', marginTop: 16, marginBottom: 4 },
    row: { display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' },
    idField: { width: 140 },
    grow: { flex: '1 1 160px', minWidth: 120 },
};

interface CredentialsEditorProps {
    config: MatterControllerConfig;
    onChange: (config: MatterControllerConfig) => void;
}

export default class CredentialsEditor extends Component<CredentialsEditorProps> {
    /** Validate a newly-entered credential id against reserved names and the other entries' ids. */
    private static idError(id: string, otherIds: string[]): string {
        const trimmed = id.trim();
        if (!trimmed) {
            return I18n.t('Identifier is required');
        }
        if (RESERVED_IDS.includes(trimmed.toLowerCase())) {
            return I18n.t('Identifier "%s" is reserved', trimmed);
        }
        if (otherIds.some(other => other.toLowerCase() === trimmed.toLowerCase())) {
            return I18n.t('Identifier "%s" is already used', trimmed);
        }
        return '';
    }

    private update(patch: Partial<MatterControllerConfig>): void {
        this.props.onChange({ ...this.props.config, ...patch });
    }

    private renderWifiList(): React.JSX.Element {
        const list = this.props.config.additionalWifiCredentials || [];
        return (
            <Box>
                {list.map((entry, index) => {
                    const otherIds = list.filter((_, i) => i !== index).map(e => e.id);
                    const idErr = CredentialsEditor.idError(entry.id, otherIds);
                    const setEntry = (patch: Partial<WifiCredentialEntry>): void => {
                        const next = list.slice();
                        next[index] = { ...entry, ...patch };
                        this.update({ additionalWifiCredentials: next });
                    };
                    return (
                        <div
                            key={index}
                            style={styles.row}
                        >
                            <TextField
                                variant="standard"
                                style={styles.idField}
                                label={I18n.t('Identifier')}
                                value={entry.id}
                                error={!!idErr}
                                helperText={idErr}
                                onChange={e => setEntry({ id: e.target.value })}
                            />
                            <TextField
                                variant="standard"
                                style={styles.grow}
                                label={I18n.t('WiFi SSID')}
                                value={entry.ssid}
                                onChange={e => setEntry({ ssid: e.target.value })}
                            />
                            <TextField
                                variant="standard"
                                style={styles.grow}
                                label={I18n.t('WiFi password')}
                                value={entry.password}
                                onChange={e => setEntry({ password: e.target.value })}
                            />
                            <IconButton
                                aria-label={I18n.t('Delete')}
                                onClick={() =>
                                    this.update({ additionalWifiCredentials: list.filter((_, i) => i !== index) })
                                }
                            >
                                <Delete />
                            </IconButton>
                        </div>
                    );
                })}
                <Button
                    startIcon={<Add />}
                    onClick={() =>
                        this.update({ additionalWifiCredentials: [...list, { id: '', ssid: '', password: '' }] })
                    }
                >
                    {I18n.t('Add WiFi network')}
                </Button>
            </Box>
        );
    }

    private renderThreadList(): React.JSX.Element {
        const list = this.props.config.additionalThreadCredentials || [];
        return (
            <Box>
                {list.map((entry, index) => {
                    const otherIds = list.filter((_, i) => i !== index).map(e => e.id);
                    const idErr = CredentialsEditor.idError(entry.id, otherIds);
                    const setEntry = (patch: Partial<ThreadCredentialEntry>): void => {
                        const next = list.slice();
                        next[index] = { ...entry, ...patch };
                        this.update({ additionalThreadCredentials: next });
                    };
                    return (
                        <div
                            key={index}
                            style={styles.row}
                        >
                            <TextField
                                variant="standard"
                                style={styles.idField}
                                label={I18n.t('Identifier')}
                                value={entry.id}
                                error={!!idErr}
                                helperText={idErr}
                                onChange={e => setEntry({ id: e.target.value })}
                            />
                            <TextField
                                variant="standard"
                                style={styles.grow}
                                label={I18n.t('Thread network name')}
                                value={entry.networkName}
                                onChange={e => setEntry({ networkName: e.target.value })}
                            />
                            <TextField
                                variant="standard"
                                style={styles.grow}
                                label={I18n.t('Thread operational dataset')}
                                value={entry.operationalDataset}
                                onChange={e => setEntry({ operationalDataset: e.target.value })}
                            />
                            <IconButton
                                aria-label={I18n.t('Delete')}
                                onClick={() =>
                                    this.update({ additionalThreadCredentials: list.filter((_, i) => i !== index) })
                                }
                            >
                                <Delete />
                            </IconButton>
                        </div>
                    );
                })}
                <Button
                    startIcon={<Add />}
                    onClick={() =>
                        this.update({
                            additionalThreadCredentials: [...list, { id: '', networkName: '', operationalDataset: '' }],
                        })
                    }
                >
                    {I18n.t('Add Thread network')}
                </Button>
            </Box>
        );
    }

    render(): React.JSX.Element {
        return (
            <Box>
                <Typography sx={styles.header}>{I18n.t('Additional WiFi networks')}</Typography>
                {this.renderWifiList()}
                <Typography sx={styles.header}>{I18n.t('Additional Thread networks')}</Typography>
                {this.renderThreadList()}
            </Box>
        );
    }
}
