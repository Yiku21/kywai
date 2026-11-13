package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.data.model.ProjectSummary
import com.aicowork.remote.data.store.ProjectSort
import com.aicowork.remote.data.store.ProjectStatus

/**
 * Filtro de «Proyectos» en la barra lateral (el botón junto al título), igual que en el escritorio y la web: orden,
 * estado, cuántos chats se ven de cada proyecto. Funciones puras para poder probarlas.
 */

/** Chats que se ven de cada proyecto antes de «Ver los X restantes». */
const val CHAT_PREVIEW = 3

private const val WEEK = 7L * 86_400_000L

fun sortProjects(list: List<ProjectSummary>, sort: ProjectSort): List<ProjectSummary> = when (sort) {
    ProjectSort.Manual -> list
    ProjectSort.Recent -> list.sortedByDescending { it.updatedAt ?: 0L }
    ProjectSort.Name -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
}

fun sortChats(list: List<ChatSummary>, sort: ProjectSort): List<ChatSummary> = when (sort) {
    ProjectSort.Manual -> list
    ProjectSort.Recent -> list.sortedByDescending { it.updatedAt ?: 0L }
    ProjectSort.Name -> list.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title })
}

/** [unseen]: proyectos con resultados terminados que aún no has visto. */
fun filterProjects(list: List<ProjectSummary>, status: ProjectStatus, unseen: Set<String>, now: Long = System.currentTimeMillis()): List<ProjectSummary> = when (status) {
    ProjectStatus.All -> list
    ProjectStatus.Busy -> list.filter { it.running }
    ProjectStatus.Unseen -> list.filter { it.id in unseen }
    ProjectStatus.Week -> list.filter { now - (it.updatedAt ?: 0L) <= WEEK }
}

/**
 * Los primeros [CHAT_PREVIEW] chats (y el abierto, aunque vaya más abajo); el resto queda tras «Ver los X restantes».
 * Por uno solo no se pone la fila: se enseña. Con [all] se ven todos.
 */
fun previewChats(list: List<ChatSummary>, all: Boolean, activeId: String?): Pair<List<ChatSummary>, Int> {
    if (all || list.size <= CHAT_PREVIEW + 1) return list to 0
    val shown = list.take(CHAT_PREVIEW).toMutableList()
    list.drop(CHAT_PREVIEW).firstOrNull { it.id == activeId }?.let(shown::add)
    return shown to (list.size - shown.size)
}
