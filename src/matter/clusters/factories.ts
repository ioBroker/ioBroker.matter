import Identify from './Identify';
import OnOff from './OnOff';
import LevelControl from './LevelControl';
import BooleanState from './BooleanState';

const Factories = [
    Identify.factory,
    OnOff.factory,
    LevelControl.factory,
    BooleanState.factory,
];

export default Factories;