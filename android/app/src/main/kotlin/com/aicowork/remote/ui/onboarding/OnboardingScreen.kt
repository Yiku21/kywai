package com.aicowork.remote.ui.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.aicowork.remote.data.net.CertificateInfo
import com.aicowork.remote.data.net.Fingerprint
import com.aicowork.remote.ui.theme.LocalStatusColors
import com.aicowork.remote.ui.theme.MonoStyle

@Composable
fun OnboardingScreen(viewModel: OnboardingViewModel) {
    val ui by viewModel.ui.collectAsStateWithLifecycle()
    BackHandler(enabled = ui.step != OnboardingStep.Welcome) { viewModel.back() }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding(), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier
                    .widthIn(max = 560.dp)
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp, vertical = 16.dp),
            ) {
                if (ui.step != OnboardingStep.Welcome) {
                    IconButton(onClick = viewModel::back) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Atrás")
                    }
                }
                ui.notice?.let { notice ->
                    Surface(color = MaterialTheme.colorScheme.tertiaryContainer, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                        Text(notice, Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium)
                    }
                    Spacer(Modifier.height(12.dp))
                }
                AnimatedContent(targetState = ui.step, label = "onboarding") { step ->
                    when (step) {
                        OnboardingStep.Welcome -> WelcomeStep(onStart = viewModel::start, onDemo = viewModel::useDemo.takeIf { viewModel.demoAvailable })
                        OnboardingStep.Server -> ServerStep(ui, viewModel)
                        OnboardingStep.Certificate -> CertificateStep(ui, viewModel)
                        OnboardingStep.Code -> CodeStep(ui, viewModel)
                    }
                }
            }
        }
    }
}

@Composable
private fun StepHeader(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, body: String) {
    Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(40.dp))
    Spacer(Modifier.height(12.dp))
    Text(title, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() })
    Spacer(Modifier.height(8.dp))
    Text(body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(20.dp))
}

@Composable
private fun WelcomeStep(onStart: () -> Unit, onDemo: (() -> Unit)?) {
    Column(Modifier.fillMaxWidth().padding(top = 32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(96.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.Groups, contentDescription = null, modifier = Modifier.size(52.dp), tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        Spacer(Modifier.height(24.dp))
        Text("Tu equipo de AI Cowork, en el bolsillo", style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(12.dp))
        Text(
            "Pide trabajo a los agentes, sigue sus tareas en directo y detén o reanuda peticiones desde el móvil. " +
                "La app se conecta a tu ordenador por Tailscale; los datos no pasan por ningún otro servidor.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = onStart, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("Conectar con mi ordenador") }
        if (onDemo != null) {
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = onDemo, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Icon(Icons.Outlined.Science, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.size(8.dp))
                Text("Probar con el servidor simulado")
            }
        }
    }
}

@Composable
private fun ServerStep(ui: OnboardingUi, vm: OnboardingViewModel) {
    Column {
        StepHeader(
            Icons.Outlined.Computer,
            "¿Dónde está AI Cowork?",
            "En el ordenador, abre ⋮ → Acceso remoto y copia la dirección HTTPS (por ejemplo https://100.101.102.103:8788 o https://mi-mac.tu-red.ts.net).",
        )
        OutlinedTextField(
            value = ui.url,
            onValueChange = vm::onUrlChange,
            label = { Text("Dirección del ordenador") },
            placeholder = { Text("https://100.x.y.z:8788") },
            singleLine = true,
            isError = ui.urlError != null,
            supportingText = ui.urlError?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
            keyboardActions = KeyboardActions(onGo = { vm.checkServer() }),
            modifier = Modifier.fillMaxWidth().testTag("serverUrl"),
        )
        ui.demoHint?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(20.dp))
        Button(onClick = vm::checkServer, enabled = !ui.checking && ui.url.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (ui.checking) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.size(8.dp))
                Text("Comprobando…")
            } else {
                Text("Continuar")
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Consejo: activa Tailscale en este móvil con la misma cuenta que el ordenador. La dirección se puede cambiar después en Ajustes.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun CertificateStep(ui: OnboardingUi, vm: OnboardingViewModel) {
    val cert = ui.certificate ?: return
    Column {
        StepHeader(
            Icons.Outlined.Shield,
            "Confirma la huella del certificado",
            "Este ordenador usa un certificado propio generado por AI Cowork. Antes de confiar en él, compara la huella con la que aparece en el ordenador (⋮ → Acceso remoto → Huella del certificado).",
        )
        FingerprintCard(cert)
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Outlined.WarningAmber, contentDescription = null, tint = LocalStatusColors.current.warning, modifier = Modifier.padding(top = 2.dp))
            Spacer(Modifier.size(8.dp))
            Text(
                "Si un solo bloque no coincide, no continúes: alguien podría estar interceptando la conexión.",
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .toggleable(value = ui.certificateChecked, role = Role.Checkbox, onValueChange = vm::onCertificateChecked)
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = ui.certificateChecked, onCheckedChange = null)
            Spacer(Modifier.size(8.dp))
            Text("He comprobado que la huella coincide con la del ordenador", style = MaterialTheme.typography.bodyLarge)
        }
        Spacer(Modifier.height(12.dp))
        Button(onClick = vm::trustCertificate, enabled = ui.certificateChecked, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text("Confiar en este certificado")
        }
        TextButton(onClick = vm::rejectCertificate, modifier = Modifier.fillMaxWidth()) { Text("No coincide, cancelar") }
    }
}

@Composable
fun FingerprintCard(cert: CertificateInfo, modifier: Modifier = Modifier) {
    val groups = Fingerprint.grouped(cert.sha256)
    Card(modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
        Column(Modifier.padding(16.dp)) {
            Text("SHA-256", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            Column(
                Modifier.semantics(mergeDescendants = true) {
                    contentDescription = "Huella SHA-256: " + cert.sha256.replace(":", " ")
                }.testTag("fingerprint"),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                groups.forEachIndexed { index, group ->
                    Text("${index + 1}  $group", style = MonoStyle)
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("Emitido para: ${cert.subject.removePrefix("CN=")}", style = MaterialTheme.typography.bodySmall)
            if (cert.alternativeNames.isNotEmpty()) {
                Text("Nombres: ${cert.alternativeNames.joinToString(", ")}", style = MaterialTheme.typography.bodySmall)
            }
            Text("Válido: ${cert.validityText}", style = MaterialTheme.typography.bodySmall)
            if (cert.selfSigned) Text("Autofirmado", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun CodeStep(ui: OnboardingUi, vm: OnboardingViewModel) {
    Column {
        StepHeader(
            Icons.Outlined.Key,
            "Introduce el código de acceso",
            "En AI Cowork, activa «Acceso desde otros dispositivos» y copia el código (distingue mayúsculas). El token que recibe la app se guarda cifrado en el almacén seguro del móvil.",
        )
        OutlinedTextField(
            value = ui.code,
            onValueChange = vm::onCodeChange,
            label = { Text("Código de acceso") },
            singleLine = true,
            isError = ui.codeError != null,
            supportingText = ui.codeError?.let { { Text(it) } },
            textStyle = MonoStyle,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Next, autoCorrectEnabled = false),
            modifier = Modifier.fillMaxWidth().testTag("pairCode"),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = ui.deviceName,
            onValueChange = vm::onDeviceNameChange,
            label = { Text("Nombre de este dispositivo") },
            supportingText = { Text("Así lo verás en la lista de dispositivos del ordenador") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { vm.pair() }),
            modifier = Modifier.fillMaxWidth(),
        )
        if (ui.pinnedSha256 != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                "Certificado confirmado: ${ui.pinnedSha256.take(23)}…",
                style = MaterialTheme.typography.bodySmall,
                color = LocalStatusColors.current.success,
            )
        }
        Spacer(Modifier.height(20.dp))
        Button(onClick = vm::pair, enabled = ui.canPair, modifier = Modifier.fillMaxWidth().height(52.dp)) {
            if (ui.pairing) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.size(8.dp))
                Text("Emparejando…")
            } else {
                Text("Emparejar")
            }
        }
        Spacer(Modifier.height(8.dp))
        FilledTonalButton(onClick = vm::back, modifier = Modifier.fillMaxWidth()) { Text("Cambiar de ordenador") }
    }
}
