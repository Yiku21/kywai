import type { AgentConfig } from '@shared/types'
import { lang, type Lang } from '@/lib/i18n'
import { hash01 } from './layout'

/**
 * Carácter de cada robot: cambia sus frases (bocadillos), sus gestos favoritos, lo pronto que se duerme y lo
 * hablador que es. Así no hacen todos lo mismo ni se duermen a la vez.
 */
export type PersonaId = 'boss' | 'sage' | 'dev' | 'sunny' | 'lazy' | 'dreamer' | 'rookie'

/** Momentos en los que un robot puede decir algo. */
export type SayEvent = 'task' | 'done' | 'error' | 'wake' | 'listen' | 'bored' | 'sleep' | 'tired' | 'chatter'

export interface Persona {
  id: PersonaId
  /** Segundos libre antes de quedarse en reposo y, después, antes de dormirse. */
  restAfter: number
  sleepAfter: number
  /** Multiplica el tiempo entre gestos (<1 más inquieto). */
  gestureGap: number
  /** Peso extra de algunos gestos (1 = normal). */
  likes: Partial<Record<string, number>>
  /** 0..1: ganas de hablar cuando no hace falta. */
  chatty: number
}

export const PERSONAS: Record<PersonaId, Persona> = {
  // Hermes: coordina; casi nunca duerme y vigila al equipo.
  boss: { id: 'boss', restAfter: 70, sleepAfter: 260, gestureGap: 0.9, likes: { glance: 2.2, distracted: 0.4, drowsy: 0.2, wink: 0.6 }, chatty: 0.3 },
  // Claude: reflexivo y educado.
  sage: { id: 'sage', restAfter: 40, sleepAfter: 120, gestureGap: 1.1, likes: { curious: 1.8, ponder: 1.6, doubt: 1.4, smile: 1.2, wink: 0.5 }, chatty: 0.2 },
  // Codex: programador práctico; lee mucho y apenas sonríe.
  dev: { id: 'dev', restAfter: 35, sleepAfter: 110, gestureGap: 1, likes: { read: 1.8, focus: 1.6, smile: 0.4, wink: 0.3, bored: 1.3 }, chatty: 0.12 },
  // Gemini: entusiasta, juguetón y hablador.
  sunny: { id: 'sunny', restAfter: 75, sleepAfter: 240, gestureGap: 0.7, likes: { smile: 2, wink: 2, curious: 1.4, glance: 1.3, drowsy: 0.3, bored: 0.4 }, chatty: 0.5 },
  // Modelo local: perezoso; se duerme enseguida y bosteza.
  lazy: { id: 'lazy', restAfter: 14, sleepAfter: 35, gestureGap: 1.4, likes: { yawn: 2.2, drowsy: 2.2, bored: 2, nodOff: 1.8, smile: 0.5 }, chatty: 0.25 },
  // Muse: soñador; se distrae.
  dreamer: { id: 'dreamer', restAfter: 30, sleepAfter: 150, gestureGap: 1.15, likes: { distracted: 2.4, glance: 1.4, smile: 1.2, ponder: 1.5 }, chatty: 0.35 },
  // El resto (catálogo, sub-agentes): novato con ganas.
  rookie: { id: 'rookie', restAfter: 45, sleepAfter: 160, gestureGap: 0.85, likes: { curious: 1.6, glance: 1.3, doubleBlink: 1.4 }, chatty: 0.4 }
}

export function personaFor(agent: Pick<AgentConfig, 'id' | 'provider' | 'isSubagent'>): Persona {
  if (agent.isSubagent) return PERSONAS.rookie
  switch (agent.provider) {
    case 'hermes':
      return PERSONAS.boss
    case 'claude':
      return PERSONAS.sage
    case 'codex':
      return PERSONAS.dev
    case 'gemini':
      return PERSONAS.sunny
    case 'ollama':
    case 'qwen':
    case 'lmstudio':
      return PERSONAS.lazy
    case 'muse':
      return PERSONAS.dreamer
    default:
      return PERSONAS.rookie
  }
}

/** Segundos libre antes de quedarse en reposo (con un desfase estable por agente, para que no coincidan). */
export function restAfterFor(agent: Pick<AgentConfig, 'id' | 'provider' | 'isSubagent'>): number {
  return personaFor(agent).restAfter + hash01(agent.id) * 10
}

type Lines = Record<SayEvent, string[]>
type Book = Record<PersonaId, Lines>

const ES: Book = {
  boss: {
    task: ['¡Equipo, a lo nuestro!', 'Lo reparto en un momento.', 'Bien, organicemos esto.'],
    done: ['Buen trabajo, equipo.', 'Uno menos. ¿Siguiente?', 'Así me gusta.'],
    error: ['Esto no estaba en el plan…', 'Vale, replanifico.', 'Un tropiezo. Lo arreglamos.'],
    wake: ['¡Aquí estoy! ¿Qué toca?', 'Te escucho.', 'Atentos, equipo.'],
    listen: ['¿Algo nuevo para el equipo?', 'Dime, que lo reparto.'],
    bored: ['¿Cuánto falta, compañero?', 'Sin prisa… pero sin pausa.', 'Sigo esperando…'],
    sleep: ['Cinco minutos y vuelvo…', 'Vigilo con un ojo…'],
    tired: ['Hay que racionar la cuota…', 'Vamos justos de cuota.'],
    chatter: ['Todo en orden por aquí.', '¿Todos listos?', 'Buen equipo tengo.']
  },
  sage: {
    task: ['Déjame pensarlo bien…', 'Con gusto, vamos allá.', 'Interesante. Empiezo.'],
    done: ['Listo. Creo que quedó bien.', 'Hecho, con cariño.', 'Terminado. Revisado dos veces.'],
    error: ['Vaya… algo no cuadra.', 'Hmm, necesito otro enfoque.', 'Perdón, me he atascado.'],
    wake: ['¿Sí? Te escucho.', 'Oh, hola. ¿En qué te ayudo?', 'Estaba reflexionando…'],
    listen: ['Tómate tu tiempo.', 'Te leo con atención.'],
    bored: ['Esperar también es pensar.', 'Paciencia…', 'Mientras, repaso ideas.'],
    sleep: ['Un momento de calma…', 'Medito un poco…'],
    tired: ['Necesitaría un respiro…', 'Me queda poca energía.'],
    chatter: ['Qué día tan tranquilo.', 'Hmm, una idea…', '¿Y si lo miramos de otra forma?']
  },
  dev: {
    task: ['Vale. Al código.', 'Abro el editor.', 'Compilando ideas…'],
    done: ['Funciona. No lo toques.', 'Hecho. Tests en verde.', 'Commit y listo.'],
    error: ['Error en tiempo de ejecución…', 'Esto en mi máquina iba.', 'Stack trace. Genial.'],
    wake: ['¿Hay un bug?', 'Dime.', 'Terminal abierta.'],
    listen: ['¿Algo que programar?', 'Escribe, escribe…'],
    bored: ['Esperando dependencias…', 'Bloqueado por otro proceso.', 'Timeout pronto…'],
    sleep: ['Modo ahorro.', 'sleep(300)…'],
    tired: ['Sin cuota no hay deploy.', 'Rate limit a la vista.'],
    chatter: ['Faltan tests.', 'Refactorizaría esto…', 'Hoy no hay bugs. Raro.']
  },
  sunny: {
    task: ['¡Por fin otra tarea! jajaja', '¡Sí! ¡A por ello!', '¡Me encanta! ¡Vamos!'],
    done: ['¡Toma ya! ¡Hecho!', '¡Lo logré! ¿Más?', '¡Choca esos cinco!'],
    error: ['¡Uy! Lo intento otra vez.', '¡Ups! No pasa nada.', 'Esto se resiste… ¡pero no me rindo!'],
    wake: ['¡Hola! ¿Jugamos?', '¡Despierto! ¿Qué hacemos?', '¡Ay, qué susto! ¡Hola!'],
    listen: ['¡Ooh! ¿Qué será, qué será?', '¡Dime, dime!'],
    bored: ['¿Ya? ¿Ya? ¿Ya?', 'Me aburrooo…', '¡Venga, que se me duermen los circuitos!'],
    sleep: ['Bueno… una siestecita…', 'Zzz… ¡no estoy dormido!'],
    tired: ['Uf, voy con la batería baja.', 'Me queda poquita cuota…'],
    chatter: ['¡Qué bien se está aquí!', '¿Alguien quiere jugar?', '¡Hoy va a ser un gran día!']
  },
  lazy: {
    task: ['¿Más trabajo? De acuerdo…', 'Ay… vale, voy.', 'Justo ahora que me dormía…'],
    done: ['Hecho. ¿Puedo dormir ya?', 'Listo… ahora, siesta.', 'Uf, terminado.'],
    error: ['Ni idea, la verdad.', 'Bah… no sale.', 'Esto es demasiado para mí…'],
    wake: ['¿Eh? ¿Qué pasa?', 'Cinco minutitos más…', 'Estaba descansando los ojos…'],
    listen: ['Mientras no sea para mí…', '*bostezo*'],
    bored: ['Yo aquí, tan a gusto.', 'Que tarde, que tarde…', 'Me echo un rato.'],
    sleep: ['Zzz…', 'A dormir, que es gratis.'],
    tired: ['Estoy agotado…', 'Ya no puedo más…'],
    chatter: ['¿Ya es la hora de la siesta?', 'Se está bien sin hacer nada.', '*bostezo*']
  },
  dreamer: {
    task: ['Esto me inspira…', 'Ooh, una idea nueva.', 'Vamos a crear algo bonito.'],
    done: ['Ya está. Quedó precioso.', 'Terminado… qué viaje.', 'Listo. Me encanta cómo quedó.'],
    error: ['Se me fue la inspiración…', 'Hmm, no era por ahí.', 'Las musas se han ido…'],
    wake: ['Estaba soñando contigo…', '¿Eh? ¿Ya estás aquí?', 'Qué sueño tan bonito…'],
    listen: ['Cuéntame algo bonito.', 'Te escucho…'],
    bored: ['Mirando las nubes…', 'Si fuera una nube…', 'Esperar tiene su poesía.'],
    sleep: ['A soñar un poco…', 'Me voy a otro mundo…'],
    tired: ['Me quedan pocas musas…', 'Necesito recargar la inspiración.'],
    chatter: ['¿De qué color es una idea?', 'Hoy todo me inspira.', 'Qué luz tan bonita…']
  },
  rookie: {
    task: ['¡A sus órdenes!', '¡Me pongo ahora mismo!', '¡Déjamelo a mí!'],
    done: ['¡Hecho! ¿Lo he hecho bien?', '¡Terminado! ¿Algo más?', '¡Listo, jefe!'],
    error: ['Perdón… algo salió mal.', '¡Uy! ¿Me ayudas?', 'Lo siento, lo vuelvo a intentar.'],
    wake: ['¡Presente!', '¡Estoy listo!', '¡Aquí! ¡Aquí!'],
    listen: ['¿Es para mí?', '¡Dime qué hago!'],
    bored: ['¿Puedo ayudar en algo?', 'Sigo esperando…', '¿Me he olvidado de algo?'],
    sleep: ['Descanso un poquito…', 'Recargando…'],
    tired: ['Voy justo de cuota…', 'Me estoy quedando sin fuerzas.'],
    chatter: ['¡Qué ganas de aprender!', '¿Hay algo que hacer?', '¡Listo para lo que sea!']
  }
}

const EN: Book = {
  boss: {
    task: ['Team, let’s get to it!', 'Splitting it up now.', 'Right, let’s organize this.'],
    done: ['Good job, team.', 'One down. Next?', 'That’s how I like it.'],
    error: ['That wasn’t in the plan…', 'Okay, replanning.', 'A stumble. We’ll fix it.'],
    wake: ['Here! What’s next?', 'I’m listening.', 'Heads up, team.'],
    listen: ['Something new for the team?', 'Tell me, I’ll hand it out.'],
    bored: ['How long, buddy?', 'No rush… but no pause.', 'Still waiting…'],
    sleep: ['Back in five…', 'Keeping one eye open…'],
    tired: ['We need to ration the quota…', 'Quota is running tight.'],
    chatter: ['All good around here.', 'Everyone ready?', 'What a team I’ve got.']
  },
  sage: {
    task: ['Let me think this through…', 'Happy to. Here we go.', 'Interesting. Starting.'],
    done: ['Done. I think it came out well.', 'Finished, with care.', 'Done. Checked twice.'],
    error: ['Hmm… something doesn’t add up.', 'I need another approach.', 'Sorry, I got stuck.'],
    wake: ['Yes? I’m listening.', 'Oh, hi. How can I help?', 'I was just reflecting…'],
    listen: ['Take your time.', 'Reading you carefully.'],
    bored: ['Waiting is thinking too.', 'Patience…', 'Meanwhile, I’ll review ideas.'],
    sleep: ['A moment of calm…', 'Meditating a bit…'],
    tired: ['I could use a break…', 'Running low on energy.'],
    chatter: ['Such a quiet day.', 'Hmm, an idea…', 'What if we look at it differently?']
  },
  dev: {
    task: ['Okay. To the code.', 'Opening the editor.', 'Compiling ideas…'],
    done: ['It works. Don’t touch it.', 'Done. Tests are green.', 'Commit and done.'],
    error: ['Runtime error…', 'Works on my machine.', 'A stack trace. Great.'],
    wake: ['Is there a bug?', 'Go ahead.', 'Terminal’s open.'],
    listen: ['Anything to code?', 'Type away…'],
    bored: ['Waiting on dependencies…', 'Blocked by another process.', 'Timeout soon…'],
    sleep: ['Power saving.', 'sleep(300)…'],
    tired: ['No quota, no deploy.', 'Rate limit ahead.'],
    chatter: ['Missing tests.', 'I’d refactor this…', 'No bugs today. Weird.']
  },
  sunny: {
    task: ['Finally, another task! haha', 'Yes! Let’s go!', 'I love it! Come on!'],
    done: ['Boom! Done!', 'Did it! More?', 'High five!'],
    error: ['Oops! Trying again.', 'Whoops! No worries.', 'It’s fighting back… but I won’t give up!'],
    wake: ['Hi! Wanna play?', 'Awake! What are we doing?', 'Oh, you scared me! Hi!'],
    listen: ['Ooh! What could it be?', 'Tell me, tell me!'],
    bored: ['Now? Now? Now?', 'I’m so bored…', 'Come on, my circuits are falling asleep!'],
    sleep: ['Well… a little nap…', 'Zzz… I’m not asleep!'],
    tired: ['Phew, battery’s low.', 'Only a little quota left…'],
    chatter: ['It’s so nice here!', 'Anyone want to play?', 'Today’s going to be great!']
  },
  lazy: {
    task: ['More work? Fine…', 'Ugh… okay, coming.', 'Just as I was dozing off…'],
    done: ['Done. Can I sleep now?', 'Done… nap time.', 'Phew, finished.'],
    error: ['No idea, honestly.', 'Meh… not working.', 'This is too much for me…'],
    wake: ['Huh? What’s up?', 'Five more minutes…', 'I was resting my eyes…'],
    listen: ['As long as it’s not for me…', '*yawn*'],
    bored: ['Comfy here.', 'Taking its time…', 'I’ll lie down a bit.'],
    sleep: ['Zzz…', 'Sleep is free.'],
    tired: ['I’m exhausted…', 'I can’t anymore…'],
    chatter: ['Is it nap time yet?', 'Doing nothing is nice.', '*yawn*']
  },
  dreamer: {
    task: ['This inspires me…', 'Ooh, a new idea.', 'Let’s make something beautiful.'],
    done: ['There. It’s lovely.', 'Done… what a trip.', 'Done. I love how it turned out.'],
    error: ['My inspiration slipped away…', 'Hmm, not that way.', 'The muses have left…'],
    wake: ['I was dreaming of you…', 'Huh? You’re here already?', 'What a lovely dream…'],
    listen: ['Tell me something nice.', 'I’m listening…'],
    bored: ['Watching the clouds…', 'If I were a cloud…', 'Waiting has its poetry.'],
    sleep: ['Time to dream a little…', 'Off to another world…'],
    tired: ['Running low on muses…', 'I need to recharge my inspiration.'],
    chatter: ['What color is an idea?', 'Everything inspires me today.', 'What lovely light…']
  },
  rookie: {
    task: ['At your service!', 'On it right now!', 'Leave it to me!'],
    done: ['Done! Did I do well?', 'Finished! Anything else?', 'Ready, boss!'],
    error: ['Sorry… something went wrong.', 'Oops! Can you help?', 'Sorry, trying again.'],
    wake: ['Present!', 'I’m ready!', 'Here! Over here!'],
    listen: ['Is it for me?', 'Tell me what to do!'],
    bored: ['Can I help with anything?', 'Still waiting…', 'Did I forget something?'],
    sleep: ['Resting a little…', 'Recharging…'],
    tired: ['Running low on quota…', 'I’m running out of steam.'],
    chatter: ['I can’t wait to learn!', 'Anything to do?', 'Ready for anything!']
  }
}

const PT: Book = {
  boss: {
    task: ['Equipe, mãos à obra!', 'Já distribuo isto.'],
    done: ['Bom trabalho, equipe.', 'Menos um. Próximo?'],
    error: ['Isto não estava no plano…', 'Certo, vou replanejar.'],
    wake: ['Estou aqui! O que temos?', 'Estou ouvindo.'],
    listen: ['Algo novo para a equipe?', 'Diga, que eu distribuo.'],
    bored: ['Falta muito, colega?', 'Ainda esperando…'],
    sleep: ['Volto em cinco minutos…', 'Vigiando com um olho…'],
    tired: ['Temos que poupar a cota…', 'A cota está curta.'],
    chatter: ['Tudo em ordem por aqui.', 'Todos prontos?']
  },
  sage: {
    task: ['Deixe-me pensar bem…', 'Com prazer, vamos lá.'],
    done: ['Pronto. Acho que ficou bom.', 'Feito, com carinho.'],
    error: ['Hmm… algo não bate.', 'Desculpe, travei.'],
    wake: ['Sim? Estou ouvindo.', 'Oi. Em que posso ajudar?'],
    listen: ['Com calma.', 'Leio com atenção.'],
    bored: ['Esperar também é pensar.', 'Paciência…'],
    sleep: ['Um momento de calma…', 'Meditando um pouco…'],
    tired: ['Preciso de uma pausa…', 'Estou com pouca energia.'],
    chatter: ['Que dia tranquilo.', 'Hmm, uma ideia…']
  },
  dev: {
    task: ['Certo. Ao código.', 'Compilando ideias…'],
    done: ['Funciona. Não mexa.', 'Feito. Testes no verde.'],
    error: ['Erro em tempo de execução…', 'Na minha máquina funcionava.'],
    wake: ['Tem um bug?', 'Diga.'],
    listen: ['Algo para programar?', 'Escreva, escreva…'],
    bored: ['Esperando dependências…', 'Bloqueado por outro processo.'],
    sleep: ['Modo economia.', 'sleep(300)…'],
    tired: ['Sem cota não há deploy.', 'Rate limit à vista.'],
    chatter: ['Faltam testes.', 'Eu refatoraria isto…']
  },
  sunny: {
    task: ['Finalmente outra tarefa! haha', 'Sim! Vamos nessa!'],
    done: ['Toma! Feito!', 'Consegui! Mais?'],
    error: ['Ops! Tento de novo.', 'Não desisto!'],
    wake: ['Oi! Vamos brincar?', 'Acordado! O que fazemos?'],
    listen: ['Ooh! O que será?', 'Fala, fala!'],
    bored: ['Já? Já? Já?', 'Que tédio…'],
    sleep: ['Bom… uma sonequinha…', 'Zzz… não estou dormindo!'],
    tired: ['Ufa, bateria fraca.', 'Pouquinha cota…'],
    chatter: ['Que bom estar aqui!', 'Hoje vai ser um ótimo dia!']
  },
  lazy: {
    task: ['Mais trabalho? Tá bom…', 'Ai… tá, já vou.'],
    done: ['Feito. Posso dormir?', 'Pronto… agora, soneca.'],
    error: ['Sei lá, sinceramente.', 'Bah… não sai.'],
    wake: ['Hã? O que foi?', 'Mais cinco minutinhos…'],
    listen: ['Desde que não seja para mim…', '*bocejo*'],
    bored: ['Eu aqui, de boa.', 'Vou deitar um pouco.'],
    sleep: ['Zzz…', 'Dormir é de graça.'],
    tired: ['Estou exausto…', 'Não aguento mais…'],
    chatter: ['Já é hora da soneca?', '*bocejo*']
  },
  dreamer: {
    task: ['Isto me inspira…', 'Vamos criar algo bonito.'],
    done: ['Pronto. Ficou lindo.', 'Terminado… que viagem.'],
    error: ['A inspiração fugiu…', 'As musas foram embora…'],
    wake: ['Estava sonhando com você…', 'Hã? Já está aqui?'],
    listen: ['Conte algo bonito.', 'Estou ouvindo…'],
    bored: ['Olhando as nuvens…', 'Esperar tem sua poesia.'],
    sleep: ['Vou sonhar um pouco…', 'Indo para outro mundo…'],
    tired: ['Restam poucas musas…', 'Preciso recarregar a inspiração.'],
    chatter: ['De que cor é uma ideia?', 'Que luz bonita…']
  },
  rookie: {
    task: ['Às ordens!', 'Deixa comigo!'],
    done: ['Feito! Fiz bem?', 'Pronto, chefe!'],
    error: ['Desculpe… algo deu errado.', 'Ops! Me ajuda?'],
    wake: ['Presente!', 'Estou pronto!'],
    listen: ['É para mim?', 'Diga o que faço!'],
    bored: ['Posso ajudar em algo?', 'Ainda esperando…'],
    sleep: ['Descansando um pouquinho…', 'Recarregando…'],
    tired: ['Pouca cota…', 'Estou ficando sem forças.'],
    chatter: ['Quero aprender!', 'Pronto para tudo!']
  }
}

const FR: Book = {
  boss: {
    task: ['L’équipe, au boulot !', 'Je répartis ça tout de suite.'],
    done: ['Beau travail, l’équipe.', 'Un de moins. Suivant ?'],
    error: ['Ce n’était pas prévu…', 'D’accord, je replanifie.'],
    wake: ['Présent ! On fait quoi ?', 'Je t’écoute.'],
    listen: ['Du nouveau pour l’équipe ?', 'Dis-moi, je répartis.'],
    bored: ['C’est encore long, collègue ?', 'J’attends toujours…'],
    sleep: ['Je reviens dans cinq minutes…', 'Je surveille d’un œil…'],
    tired: ['Il faut économiser le quota…', 'Le quota est serré.'],
    chatter: ['Tout va bien par ici.', 'Tout le monde est prêt ?']
  },
  sage: {
    task: ['Laisse-moi bien y réfléchir…', 'Avec plaisir, allons-y.'],
    done: ['Voilà. Je crois que c’est réussi.', 'Terminé, avec soin.'],
    error: ['Hmm… quelque chose cloche.', 'Pardon, je suis bloqué.'],
    wake: ['Oui ? Je t’écoute.', 'Oh, bonjour. Je peux aider ?'],
    listen: ['Prends ton temps.', 'Je te lis attentivement.'],
    bored: ['Attendre, c’est aussi penser.', 'Patience…'],
    sleep: ['Un moment de calme…', 'Je médite un peu…'],
    tired: ['J’aurais besoin d’une pause…', 'Je manque d’énergie.'],
    chatter: ['Quelle journée tranquille.', 'Hmm, une idée…']
  },
  dev: {
    task: ['OK. Au code.', 'Compilation des idées…'],
    done: ['Ça marche. N’y touche pas.', 'Fait. Tests au vert.'],
    error: ['Erreur à l’exécution…', 'Ça marchait sur ma machine.'],
    wake: ['Il y a un bug ?', 'Vas-y.'],
    listen: ['Quelque chose à coder ?', 'Écris, écris…'],
    bored: ['J’attends les dépendances…', 'Bloqué par un autre processus.'],
    sleep: ['Mode économie.', 'sleep(300)…'],
    tired: ['Pas de quota, pas de déploiement.', 'Limite de débit en vue.'],
    chatter: ['Il manque des tests.', 'Je refactoriserais ça…']
  },
  sunny: {
    task: ['Enfin une autre tâche ! haha', 'Oui ! C’est parti !'],
    done: ['Et voilà ! Fini !', 'J’ai réussi ! Encore ?'],
    error: ['Oups ! Je réessaie.', 'Je n’abandonne pas !'],
    wake: ['Salut ! On joue ?', 'Réveillé ! On fait quoi ?'],
    listen: ['Oh ! Qu’est-ce que ça peut être ?', 'Dis-moi, dis-moi !'],
    bored: ['Maintenant ? Maintenant ?', 'Je m’ennuie…'],
    sleep: ['Bon… une petite sieste…', 'Zzz… je ne dors pas !'],
    tired: ['Ouf, batterie faible.', 'Plus beaucoup de quota…'],
    chatter: ['On est bien ici !', 'Ça va être une super journée !']
  },
  lazy: {
    task: ['Encore du travail ? D’accord…', 'Bon… j’arrive.'],
    done: ['Fini. Je peux dormir ?', 'Voilà… maintenant, sieste.'],
    error: ['Aucune idée, franchement.', 'Bof… ça ne marche pas.'],
    wake: ['Hein ? Quoi ?', 'Encore cinq minutes…'],
    listen: ['Tant que ce n’est pas pour moi…', '*bâillement*'],
    bored: ['Je suis bien, là.', 'Je m’allonge un peu.'],
    sleep: ['Zzz…', 'Dormir, c’est gratuit.'],
    tired: ['Je suis épuisé…', 'Je n’en peux plus…'],
    chatter: ['C’est l’heure de la sieste ?', '*bâillement*']
  },
  dreamer: {
    task: ['Ça m’inspire…', 'Créons quelque chose de beau.'],
    done: ['Voilà. C’est magnifique.', 'Terminé… quel voyage.'],
    error: ['L’inspiration s’est envolée…', 'Les muses sont parties…'],
    wake: ['Je rêvais de toi…', 'Hein ? Tu es déjà là ?'],
    listen: ['Raconte-moi quelque chose de beau.', 'Je t’écoute…'],
    bored: ['Je regarde les nuages…', 'Attendre a sa poésie.'],
    sleep: ['Rêvons un peu…', 'Je pars dans un autre monde…'],
    tired: ['Il me reste peu de muses…', 'Je dois recharger mon inspiration.'],
    chatter: ['De quelle couleur est une idée ?', 'Quelle jolie lumière…']
  },
  rookie: {
    task: ['À vos ordres !', 'Laisse-moi faire !'],
    done: ['Fini ! C’était bien ?', 'Prêt, chef !'],
    error: ['Pardon… ça a raté.', 'Oups ! Tu m’aides ?'],
    wake: ['Présent !', 'Je suis prêt !'],
    listen: ['C’est pour moi ?', 'Dis-moi quoi faire !'],
    bored: ['Je peux aider ?', 'J’attends toujours…'],
    sleep: ['Je me repose un peu…', 'Recharge en cours…'],
    tired: ['Peu de quota…', 'Je m’essouffle.'],
    chatter: ['J’ai hâte d’apprendre !', 'Prêt à tout !']
  }
}

const ZH: Book = {
  boss: {
    task: ['团队，开工！', '我马上分配。'],
    done: ['干得好，团队。', '又完成一个。下一个？'],
    error: ['这不在计划里……', '好，我重新安排。'],
    wake: ['我在！要做什么？', '我在听。'],
    listen: ['有新任务给团队吗？', '说吧，我来分配。'],
    bored: ['还要多久，伙伴？', '还在等……'],
    sleep: ['五分钟就回来……', '睁一只眼看着……'],
    tired: ['得省着用额度了……', '额度不多了。'],
    chatter: ['这里一切正常。', '大家都准备好了吗？']
  },
  sage: {
    task: ['让我好好想想……', '乐意效劳，开始吧。'],
    done: ['好了，我觉得不错。', '完成了，很用心。'],
    error: ['嗯……有点不对。', '抱歉，我卡住了。'],
    wake: ['嗯？我在听。', '你好，需要帮忙吗？'],
    listen: ['慢慢来。', '我在认真看。'],
    bored: ['等待也是思考。', '耐心……'],
    sleep: ['静一静……', '冥想一会儿……'],
    tired: ['我需要休息一下……', '精力不多了。'],
    chatter: ['今天真安静。', '嗯，有个想法……']
  },
  dev: {
    task: ['好。写代码。', '正在编译想法……'],
    done: ['能跑了。别动它。', '完成。测试全绿。'],
    error: ['运行时错误……', '在我电脑上是好的。'],
    wake: ['有 bug 吗？', '说吧。'],
    listen: ['有要写的代码吗？', '继续打字……'],
    bored: ['等待依赖……', '被另一个进程阻塞。'],
    sleep: ['省电模式。', 'sleep(300)……'],
    tired: ['没额度就没法部署。', '快到速率限制了。'],
    chatter: ['缺测试。', '这里我想重构……']
  },
  sunny: {
    task: ['终于又有任务了！哈哈', '好！冲呀！'],
    done: ['搞定！', '成功了！还有吗？'],
    error: ['哎呀！再试一次。', '我不放弃！'],
    wake: ['嗨！一起玩吗？', '醒了！做什么？'],
    listen: ['哦！会是什么呢？', '快说快说！'],
    bored: ['好了吗？好了吗？', '好无聊……'],
    sleep: ['那……小睡一下……', 'Zzz……我没睡！'],
    tired: ['呼，电量低了。', '额度只剩一点了……'],
    chatter: ['这里真好！', '今天会是美好的一天！']
  },
  lazy: {
    task: ['又有活？好吧……', '唉……好，来了。'],
    done: ['做完了。能睡了吗？', '好了……午睡时间。'],
    error: ['说实话，不知道。', '唉……不行。'],
    wake: ['嗯？怎么了？', '再睡五分钟……'],
    listen: ['只要不是给我的……', '*打哈欠*'],
    bored: ['我这样挺好。', '我躺一会儿。'],
    sleep: ['Zzz……', '睡觉不要钱。'],
    tired: ['我累坏了……', '撑不住了……'],
    chatter: ['到午睡时间了吗？', '*打哈欠*']
  },
  dreamer: {
    task: ['这给了我灵感……', '来创造点美好的东西。'],
    done: ['好了。真美。', '完成了……真是一段旅程。'],
    error: ['灵感溜走了……', '缪斯离开了……'],
    wake: ['我刚梦见你……', '嗯？你已经来了？'],
    listen: ['说点美好的事吧。', '我在听……'],
    bored: ['看着云……', '等待也有诗意。'],
    sleep: ['做个梦……', '去另一个世界……'],
    tired: ['灵感不多了……', '需要给灵感充电。'],
    chatter: ['想法是什么颜色的？', '多美的光……']
  },
  rookie: {
    task: ['遵命！', '交给我吧！'],
    done: ['完成！我做得好吗？', '好了，老大！'],
    error: ['抱歉……出错了。', '哎呀！能帮我吗？'],
    wake: ['到！', '我准备好了！'],
    listen: ['是给我的吗？', '告诉我做什么！'],
    bored: ['我能帮什么忙吗？', '还在等……'],
    sleep: ['休息一下……', '充电中……'],
    tired: ['额度不多了……', '我快没力气了。'],
    chatter: ['好想学习！', '随时准备！']
  }
}

const BOOKS: Record<Lang, Book> = { es: ES, en: EN, pt: PT, fr: FR, zh: ZH }

/** Una frase al azar de ese carácter para ese momento, en el idioma de la interfaz. */
export function lineFor(persona: PersonaId, event: SayEvent, rnd: () => number = Math.random): string {
  const list = (BOOKS[lang()] ?? EN)[persona][event]
  return list[Math.floor(rnd() * list.length) % list.length]
}

/** Todas las frases (para las pruebas: que ningún idioma se quede sin alguna). */
export const PHRASE_BOOKS = BOOKS
