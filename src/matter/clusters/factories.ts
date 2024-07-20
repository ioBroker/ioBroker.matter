import BooleanState from './BooleanState';
import Identify from './Identify';
import LevelControl from './LevelControl';
import OnOff from './OnOff';

const Factories = [Identify.factory, OnOff.factory, LevelControl.factory, BooleanState.factory];

export default Factories;
