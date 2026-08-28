import { registerRootComponent } from 'expo';

// Antes do componente raiz, e de propósito: o Android carrega este arquivo
// quando acorda o app para atender um botão da notificação com o aplicativo
// fechado, e nesse caso nenhuma tela chega a montar. A tarefa precisa já estar
// definida quando o bundle termina de carregar.
import './src/alarme/tarefaDeFundo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
