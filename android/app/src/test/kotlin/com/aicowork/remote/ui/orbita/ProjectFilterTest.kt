package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.ChatSummary
import com.aicowork.remote.data.model.ProjectSummary
import com.aicowork.remote.data.store.ProjectSort
import com.aicowork.remote.data.store.ProjectStatus
import org.junit.Assert.assertEquals
import org.junit.Test

/** Filtro de «Proyectos» en la barra lateral: 3 chats y «Ver los X restantes», orden y estado. */
class ProjectFilterTest {
    private val chats = listOf("a", "b", "c", "d", "e", "f").map { ChatSummary(id = it, messageCount = 1) }

    @Test
    fun enseñaTresYCuentaElResto() {
        val (shown, hidden) = previewChats(chats, all = false, activeId = null)
        assertEquals(listOf("a", "b", "c"), shown.map { it.id })
        assertEquals(3, hidden)
    }

    @Test
    fun elAbiertoSeVeAunqueVayaAbajo() {
        val (shown, hidden) = previewChats(chats, all = false, activeId = "e")
        assertEquals(listOf("a", "b", "c", "e"), shown.map { it.id })
        assertEquals(2, hidden)
    }

    @Test
    fun conTodosOPorUnoNoEsconde() {
        assertEquals(0, previewChats(chats, all = true, activeId = null).second)
        assertEquals(0, previewChats(chats.take(4), all = false, activeId = null).second)
    }

    @Test
    fun ordenYEstado() {
        val ps = listOf(ProjectSummary("1", "beta", updatedAt = 10), ProjectSummary("2", "Alfa", updatedAt = 30, running = true), ProjectSummary("3", "gamma", updatedAt = 20))
        assertEquals(listOf("2", "3", "1"), sortProjects(ps, ProjectSort.Recent).map { it.id })
        assertEquals(listOf("2", "1", "3"), sortProjects(ps, ProjectSort.Name).map { it.id })
        assertEquals(listOf("1", "2", "3"), sortProjects(ps, ProjectSort.Manual).map { it.id })
        assertEquals(listOf("2"), filterProjects(ps, ProjectStatus.Busy, emptySet()).map { it.id })
        assertEquals(listOf("3"), filterProjects(ps, ProjectStatus.Unseen, setOf("3")).map { it.id })
        assertEquals(listOf("2"), filterProjects(ps, ProjectStatus.Week, emptySet(), now = 25 + 7L * 86_400_000L).map { it.id })
    }
}
